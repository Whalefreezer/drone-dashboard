import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { FormEvent, useState } from 'react';
import { login, isAuthenticated, authenticatedKind, pb } from '../api/pb.ts';

export const Route = createFileRoute('/login')({
    beforeLoad: () => {
        if (isAuthenticated()) {
            throw redirect({ to: '/admin' });
        }
    },
    component: LoginPage,
});

function LoginPage() {
    const navigate = useNavigate();
    const [kind, setKind] = useState<'user' | 'admin'>('admin');
    const [identity, setIdentity] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            await login(kind, identity.trim(), password);
            // Navigate to admin once authed
            if (pb.authStore.isValid) {
                navigate({ to: '/admin' });
            } else {
                setError('Authentication failed.');
            }
        } catch (err: any) {
            setError(err?.message ?? 'Login failed');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{ padding: 16, maxWidth: 420 }}>
            <h1>Sign In</h1>
            <p style={{ color: '#666' }}>Choose account type, then enter credentials.</p>
            <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                            type='radio'
                            name='kind'
                            value='admin'
                            checked={kind === 'admin'}
                            onChange={() => setKind('admin')}
                        />
                        Admin (_superusers)
                    </label>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                            type='radio'
                            name='kind'
                            value='user'
                            checked={kind === 'user'}
                            onChange={() => setKind('user')}
                        />
                        User (users)
                    </label>
                </div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span>Identity (email or username)</span>
                    <input
                        type='text'
                        required
                        value={identity}
                        onChange={(e) => setIdentity(e.currentTarget.value)}
                        placeholder={kind === 'admin' ? 'admin@example.com' : 'user@example.com'}
                    />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span>Password</span>
                    <input
                        type='password'
                        required
                        value={password}
                        onChange={(e) => setPassword(e.currentTarget.value)}
                        placeholder='••••••••'
                    />
                </label>

                <button type='submit' disabled={loading}>
                    {loading ? 'Signing in…' : 'Sign In'}
                </button>

                {error && (
                    <div style={{ color: 'crimson' }}>{error}</div>
                )}
            </form>

            {isAuthenticated() && (
                <p style={{ marginTop: 12, color: '#2a2' }}>
                    Signed in as {authenticatedKind()} — continue to Admin.
                </p>
            )}
        </div>
    );
}

