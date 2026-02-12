import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock modules before importing the component
const mockNavigate = jest.fn();
let mockUser: any = null;
let mockLoading = false;

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: mockUser, loading: mockLoading }),
}));

jest.mock('react-router-dom', () => ({
  Navigate: (props: any) => {
    mockNavigate(props);
    return <div data-testid="navigate" />;
  },
  useLocation: () => ({ pathname: '/protected' }),
}));

// Import after mocks
import RequireAuth from '../RequireAuth';

describe('RequireAuth', () => {
  beforeEach(() => {
    mockUser = null;
    mockLoading = false;
    mockNavigate.mockClear();
  });

  it('renders children when user is authenticated', () => {
    mockUser = { id: '1', email: 'test@example.com' };

    render(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    mockUser = null;

    render(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: '/login', replace: true })
    );
  });

  it('renders nothing while loading', () => {
    mockLoading = true;

    const { container } = render(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
  });
});
