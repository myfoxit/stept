import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock API functions
let mockMeResolve: ((value: any) => void) | null = null;
let mockMeReject: ((reason: any) => void) | null = null;
const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockLogout = jest.fn();
const mockMe = jest.fn();

jest.mock('@/api/auth', () => ({
  login: (...args: any[]) => mockLogin(...args),
  register: (...args: any[]) => mockRegister(...args),
  logout: (...args: any[]) => mockLogout(...args),
  me: (...args: any[]) => mockMe(...args),
}));

// Mock react-query
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn(),
  }),
}));

// Import after mocks
import { AuthProvider, useAuth } from '@/providers/auth-provider';

function TestConsumer() {
  const { user, loading, login, logout, register } = useAuth();
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'ready'}</div>
      <div data-testid="user">{user ? user.email : 'no-user'}</div>
      <button onClick={() => login({ email: 'test@test.com', password: 'pass' })}>
        Login
      </button>
      <button onClick={() => logout()}>Logout</button>
      <button onClick={() => register({ email: 'new@test.com', password: 'pass', name: 'New' } as any)}>
        Register
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state initially then resolves', async () => {
    const user = { id: '1', email: 'test@test.com', name: 'Test' };
    mockMe.mockResolvedValueOnce(user);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    // Should show loading initially
    expect(screen.getByTestId('loading').textContent).toBe('loading');

    // After me() resolves, should set user
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready');
    });
    expect(screen.getByTestId('user').textContent).toBe('test@test.com');
  });

  it('sets user after successful me() call', async () => {
    const user = { id: '1', email: 'hello@test.com', name: 'Hello' };
    mockMe.mockResolvedValueOnce(user);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('hello@test.com');
    });
  });

  it('sets user to null when me() fails', async () => {
    mockMe.mockRejectedValueOnce(new Error('Unauthorized'));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready');
    });
    expect(screen.getByTestId('user').textContent).toBe('no-user');
  });

  it('login calls API and updates user', async () => {
    mockMe.mockRejectedValueOnce(new Error('Not logged in')); // Initial check
    mockLogin.mockResolvedValueOnce({}); // login call
    const user = { id: '2', email: 'logged@test.com', name: 'Logged' };
    mockMe.mockResolvedValueOnce(user); // me() after login

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready');
    });

    await act(async () => {
      screen.getByText('Login').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('logged@test.com');
    });
    expect(mockLogin).toHaveBeenCalledWith({ email: 'test@test.com', password: 'pass' });
  });

  it('logout clears user', async () => {
    const user = { id: '1', email: 'bye@test.com', name: 'Bye' };
    mockMe.mockResolvedValueOnce(user);
    mockLogout.mockResolvedValueOnce(undefined);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('bye@test.com');
    });

    await act(async () => {
      screen.getByText('Logout').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('no-user');
    });
  });

  it('register calls API and updates user', async () => {
    mockMe.mockRejectedValueOnce(new Error('Not logged in'));
    mockRegister.mockResolvedValueOnce({});
    const newUser = { id: '3', email: 'new@test.com', name: 'New' };
    mockMe.mockResolvedValueOnce(newUser);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('ready');
    });

    await act(async () => {
      screen.getByText('Register').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('new@test.com');
    });
  });

  it('throws when useAuth is used outside provider', () => {
    // Suppress console.error from React error boundary
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestConsumer />);
    }).toThrow('useAuth must be used inside <AuthProvider>');

    jest.restoreAllMocks();
  });
});
