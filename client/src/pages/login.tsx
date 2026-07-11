import { useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLogin } from '@/hooks/useLogin';

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login.mutate({ username, password }, { onSuccess: () => navigate('/') });
  };

  const errorMessage =
    login.error != null
      ? login.error.status === 401
        ? 'Invalid username or password.'
        : 'Sign-in failed. Please try again.'
      : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-pov-gray px-4 font-poppins text-charcoal">
      <Card className="w-full max-w-md border-beige-200">
        <CardHeader>
          <CardTitle className="text-charcoal">Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-charcoal">
                Username
              </Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-charcoal">
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {errorMessage && (
              <p role="alert" className="text-sm text-error-dark">
                {errorMessage}
              </p>
            )}
            <Button
              type="submit"
              disabled={login.isPending}
              className="w-full bg-pov-charcoal text-pov-white hover:bg-charcoal-700"
            >
              {login.isPending ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
