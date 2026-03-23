import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { LogIn, UserPlus, KeyRound } from 'lucide-react';

type Mode = 'login' | 'signup' | 'forgot';

const AuthPage = () => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [storeName, setStoreName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success('Password reset link sent to your email');
        setMode('login');
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        // Update store name after signup
        if (storeName.trim()) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from('profiles').update({ store_name: storeName.trim() }).eq('user_id', user.id);
          }
        }
        toast.success('Account created! Check your email to confirm.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Welcome back!');
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🏪</div>
          <h1 className="text-2xl font-extrabold">Tindahan</h1>
          <p className="text-sm text-muted-foreground">Your Sari-Sari Store Manager</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <h2 className="font-bold text-lg text-center">
            {mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Reset Password'}
          </h2>

          <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required className="h-11" />

          {mode !== 'forgot' && (
            <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="h-11" />
          )}

          {mode === 'signup' && (
            <Input placeholder="Store name (optional)" value={storeName} onChange={e => setStoreName(e.target.value)} className="h-11" />
          )}

          <Button type="submit" disabled={loading} className="w-full h-11 font-bold">
            {loading ? '...' : mode === 'login' ? <><LogIn className="w-4 h-4 mr-1" /> Sign In</> : mode === 'signup' ? <><UserPlus className="w-4 h-4 mr-1" /> Sign Up</> : <><KeyRound className="w-4 h-4 mr-1" /> Send Reset Link</>}
          </Button>

          <div className="text-center text-sm space-y-1">
            {mode === 'login' && (
              <>
                <button type="button" onClick={() => setMode('forgot')} className="text-primary font-semibold block mx-auto">Forgot password?</button>
                <p className="text-muted-foreground">No account? <button type="button" onClick={() => setMode('signup')} className="text-primary font-semibold">Sign up</button></p>
              </>
            )}
            {mode === 'signup' && (
              <p className="text-muted-foreground">Already have an account? <button type="button" onClick={() => setMode('login')} className="text-primary font-semibold">Sign in</button></p>
            )}
            {mode === 'forgot' && (
              <button type="button" onClick={() => setMode('login')} className="text-primary font-semibold">Back to sign in</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AuthPage;
