import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LogOut, Lock, Mail } from 'lucide-react';
import { toast } from 'sonner';

const ProfilePage = () => {
  const { user, signOut } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword.trim()) return toast.error('Enter a new password');
    if (newPassword.length < 6) return toast.error('Password must be at least 6 characters');
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match');

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Password updated successfully');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  return (
    <div className="pb-20 max-w-3xl mx-auto px-4 pt-4 animate-fade-in">
      <h1 className="text-xl font-extrabold mb-4">👤 Profile</h1>

      <div className="bg-card rounded-xl border border-border p-4 mb-4">
        <div className="flex items-center gap-3 mb-1">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Email</span>
        </div>
        <p className="font-semibold text-sm ml-7">{user?.email}</p>
      </div>

      <div className="bg-card rounded-xl border border-border p-4 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-bold text-sm">Change Password</h2>
        </div>
        <div className="space-y-3">
          <Input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="h-11"
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className="h-11"
          />
          <Button onClick={handleChangePassword} disabled={loading} className="w-full h-11 font-bold">
            {loading ? 'Updating...' : 'Update Password'}
          </Button>
        </div>
      </div>

      <Button variant="destructive" onClick={signOut} className="w-full h-11 font-bold">
        <LogOut className="w-4 h-4 mr-2" /> Sign Out
      </Button>
    </div>
  );
};

export default ProfilePage;
