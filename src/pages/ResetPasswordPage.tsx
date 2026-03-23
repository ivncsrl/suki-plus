import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const ResetPasswordPage = () => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Password updated!');
      navigate('/');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-card rounded-2xl border border-border p-5 space-y-3 animate-fade-in">
        <h2 className="font-bold text-lg text-center">Set New Password</h2>
        <Input type="password" placeholder="New password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="h-11" />
        <Button type="submit" disabled={loading} className="w-full h-11 font-bold">
          {loading ? '...' : 'Update Password'}
        </Button>
      </form>
    </div>
  );
};

export default ResetPasswordPage;
