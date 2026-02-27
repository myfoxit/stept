import { EventEmitter } from 'events';
import { shell } from 'electron';
import * as crypto from 'crypto';
import * as url from 'url';
import WebSocket from 'ws';
import { SettingsManager } from './settings';

export interface UserInfo {
  id: string;
  email: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  userId: string;
  role: string;
}

export interface AuthStatus {
  isAuthenticated: boolean;
  user?: UserInfo;
  projects?: Project[];
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export class AuthService extends EventEmitter {
  private static readonly REDIRECT_URI = 'ondoki://auth/callback';

  private accessToken?: string;
  private refreshToken?: string;
  private codeVerifier?: string;
  private state?: string;
  private currentUser?: UserInfo;
  private userProjects?: Project[];
  private webSocket?: WebSocket;
  private wsReconnectTimer?: NodeJS.Timeout;
  private isReconnecting = false;

  constructor(private settingsManager: SettingsManager) {
    super();

    // Load refresh token on startup
    this.refreshToken = this.settingsManager.getRefreshToken();
  }

  private getApiBaseUrl(): string {
    const settings = this.settingsManager.getSettings();
    return (settings.chatApiUrl || 'http://localhost:8000/api/v1').replace(/\/+$/, '');
  }

  private getWsBaseUrl(): string {
    const apiUrl = this.getApiBaseUrl();
    return apiUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  }

  public async getStatus(): Promise<AuthStatus> {
    return {
      isAuthenticated: !!this.accessToken,
      user: this.currentUser,
      projects: this.userProjects,
    };
  }

  public getAccessToken(): string | undefined {
    return this.accessToken;
  }

  public async tryAutoLogin(): Promise<boolean> {
    if (!this.refreshToken) {
      return false;
    }

    try {
      console.log('Attempting auto-login with stored refresh token');
      
      const response = await fetch(`${this.getApiBaseUrl()}/auth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
        }),
      });

      if (response.ok) {
        const tokenData: TokenResponse = await response.json();
        this.accessToken = tokenData.access_token;
        this.refreshToken = tokenData.refresh_token;

        // Update stored refresh token
        this.settingsManager.setRefreshToken(this.refreshToken);

        // Fetch user info and projects
        await this.fetchUserInfo();
        await this.fetchUserProjects();

        // Connect to WebSocket for notifications
        await this.connectToNotificationServer();

        this.emit('status-changed', await this.getStatus());
        console.log('Auto-login successful');
        return true;
      } else {
        console.log('Auto-login failed: invalid refresh token');
        // Clear invalid refresh token
        this.settingsManager.clearRefreshToken();
        this.refreshToken = undefined;
        return false;
      }
    } catch (error) {
      console.error('Auto-login error:', error);
      return false;
    }
  }

  public async initiateLogin(): Promise<void> {
    try {
      // Generate PKCE parameters
      this.codeVerifier = this.generateCodeVerifier();
      const codeChallenge = await this.generateCodeChallenge(this.codeVerifier);
      this.state = this.generateState();

      // Build authorization URL
      const authUrl = new URL(`${this.getApiBaseUrl()}/auth/authorize`);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('redirect_uri', AuthService.REDIRECT_URI);
      authUrl.searchParams.set('state', this.state);

      console.log('Opening authorization URL:', authUrl.origin + authUrl.pathname);

      // Open in default browser
      await shell.openExternal(authUrl.toString());
    } catch (error) {
      throw new Error(`Failed to initiate login: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async handleCallback(callbackUrl: string): Promise<boolean> {
    try {
      console.log('Handling auth callback');
      
      const parsedUrl = new URL(callbackUrl);
      const code = parsedUrl.searchParams.get('code');
      const state = parsedUrl.searchParams.get('state');
      const error = parsedUrl.searchParams.get('error');

      if (error) {
        console.error('Auth callback error:', error);
        return false;
      }

      // Verify state to prevent CSRF
      if (state !== this.state) {
        console.error('State mismatch - possible CSRF attack');
        return false;
      }

      if (!code) {
        console.error('No authorization code in callback');
        return false;
      }

      if (!this.codeVerifier) {
        console.error('No code verifier stored');
        return false;
      }

      // Exchange code for tokens
      const response = await fetch(`${this.getApiBaseUrl()}/auth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: this.codeVerifier,
          redirect_uri: AuthService.REDIRECT_URI,
        }),
      });

      if (response.ok) {
        const tokenData: TokenResponse = await response.json();
        this.accessToken = tokenData.access_token;
        this.refreshToken = tokenData.refresh_token;

        // Store refresh token securely
        this.settingsManager.setRefreshToken(this.refreshToken);

        // Fetch user info and projects
        await this.fetchUserInfo();
        await this.fetchUserProjects();

        // Connect to WebSocket for notifications
        await this.connectToNotificationServer();

        // Clear temporary auth data
        this.state = undefined;
        this.codeVerifier = undefined;

        this.emit('status-changed', await this.getStatus());
        console.log('Authentication successful');
        return true;
      } else {
        const errorText = await response.text();
        console.error('Token exchange failed:', response.status, errorText);
        return false;
      }
    } catch (error) {
      console.error('Auth callback error:', error);
      return false;
    }
  }

  public async logout(): Promise<void> {
    try {
      // Disconnect WebSocket first
      await this.disconnectWebSocket();

      // Revoke tokens on server if possible
      if (this.refreshToken) {
        try {
          await fetch(`${this.getApiBaseUrl()}/auth/revoke`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              refresh_token: this.refreshToken,
            }),
          });
          console.log('Token revoked on server');
        } catch (error) {
          console.error('Failed to revoke token on server:', error);
        }
      }

      // Clear local tokens and data
      this.clearTokens();
      
      console.log('Logout successful');
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear local tokens even if server call fails
      this.clearTokens();
    }
  }

  public clearTokens(): void {
    this.accessToken = undefined;
    this.refreshToken = undefined;
    this.currentUser = undefined;
    this.userProjects = undefined;
    this.settingsManager.clearRefreshToken();
    
    this.emit('status-changed', {
      isAuthenticated: false,
    });
  }

  private async fetchUserInfo(): Promise<void> {
    if (!this.accessToken) return;

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/auth/me`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (response.ok) {
        this.currentUser = await response.json();
        console.log('Fetched user info:', this.currentUser?.email);
      } else {
        console.error('Failed to fetch user info:', response.status);
      }
    } catch (error) {
      console.error('Error fetching user info:', error);
    }
  }

  private async fetchUserProjects(): Promise<void> {
    if (!this.accessToken || !this.currentUser) return;

    try {
      const response = await fetch(`${this.getApiBaseUrl()}/projects/${this.currentUser.id}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (response.ok) {
        this.userProjects = await response.json();
        console.log(`Fetched ${this.userProjects?.length} projects`);
      } else {
        console.error('Failed to fetch projects:', response.status);
        this.userProjects = [];
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      this.userProjects = [];
    }
  }

  private async connectToNotificationServer(): Promise<void> {
    if (!this.accessToken) {
      console.log('Cannot connect to WebSocket: no access token');
      return;
    }

    try {
      // Disconnect existing connection
      await this.disconnectWebSocket();

      const wsUrl = `${this.getWsBaseUrl()}/auth/ws/notifications?token=${encodeURIComponent(this.accessToken)}`;
      console.log('Connecting to WebSocket:', this.getWsBaseUrl() + '/auth/ws/notifications');

      this.webSocket = new WebSocket(wsUrl);

      this.webSocket.on('open', () => {
        console.log('WebSocket connected');
        this.isReconnecting = false;
        
        // Clear any reconnection timer
        if (this.wsReconnectTimer) {
          clearTimeout(this.wsReconnectTimer);
          this.wsReconnectTimer = undefined;
        }

        // Start keep-alive
        this.startKeepAlive();
      });

      this.webSocket.on('message', (data) => {
        const message = data.toString();

        if (message === 'FORCE_LOGOUT') {
          console.log('Received force logout notification');
          this.handleForceLogout();
        }
      });

      this.webSocket.on('close', (code, reason) => {
        console.log(`WebSocket closed: ${code} ${reason}`);
        this.webSocket = undefined;

        // Attempt reconnection if we're still authenticated and not manually disconnecting
        if (this.accessToken && !this.isReconnecting) {
          this.scheduleReconnection();
        }
      });

      this.webSocket.on('error', (error) => {
        console.error('WebSocket error:', error);
        
        if (error.message?.includes('403')) {
          console.log('WebSocket authentication failed - token may be expired');
        }
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
    }
  }

  private async disconnectWebSocket(): Promise<void> {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = undefined;
    }

    if (this.webSocket) {
      this.webSocket.removeAllListeners();
      
      if (this.webSocket.readyState === WebSocket.OPEN) {
        this.webSocket.close(1000, 'Client disconnecting');
      }
      
      this.webSocket = undefined;
    }

    console.log('WebSocket disconnected');
  }

  private scheduleReconnection(): void {
    if (this.isReconnecting) return;
    
    this.isReconnecting = true;
    console.log('Scheduling WebSocket reconnection in 5 seconds...');
    
    this.wsReconnectTimer = setTimeout(async () => {
      if (this.accessToken) {
        await this.connectToNotificationServer();
      }
    }, 5000);
  }

  private startKeepAlive(): void {
    const keepAlive = () => {
      if (this.webSocket?.readyState === WebSocket.OPEN) {
        this.webSocket.send('ping');
        setTimeout(keepAlive, 30000); // Send ping every 30 seconds
      }
    };
    
    // Start keep-alive after initial delay
    setTimeout(keepAlive, 30000);
  }

  private handleForceLogout(): void {
    // Disconnect WebSocket and clear tokens
    this.disconnectWebSocket();
    this.clearTokens();
    
    // Emit force logout event
    this.emit('force-logout');
  }

  // PKCE utility methods
  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return hash.toString('base64url');
  }

  private generateState(): string {
    return crypto.randomBytes(16).toString('base64url');
  }
}