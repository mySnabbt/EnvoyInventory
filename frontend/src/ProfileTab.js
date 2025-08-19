import React, { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/card';
import { Skeleton } from './components/ui/skeleton';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

export default function ProfileTab({ token, onUserUpdate, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  const fileInputRef = useRef(null);

  const roleLabel = (r) => (r === 3 ? 'Administrator' : r === 2 ? 'Manager' : 'Staff');

  const fetchMe = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const text = await res.text();
      let json = {};
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('Failed to parse /me response');
      }

      if (!res.ok) throw new Error(json.error || 'Failed to load profile');

      setUser(json.user);

      // sync localStorage + notify parent so sidebar avatar updates
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      const merged = { ...stored, ...json.user, avatar_url: json.user.avatar_url || null };
      localStorage.setItem('user', JSON.stringify(merged));
      if (typeof onUserUpdate === 'function') onUserUpdate(merged);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAddOrChangeClick = () => fileInputRef.current?.click();

  const onFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Please choose an image under 5 MB.');
      e.target.value = '';
      return;
    }

    try {
      setSaving(true);
      const form = new FormData();
      form.append('avatar', file);

      const res = await fetch(`${API_URL}/users/${user.user_id}/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const text = await res.text();
      let json = {};
      try {
        json = JSON.parse(text);
      } catch {}
      if (!res.ok) throw new Error(json?.error || `Upload failed (${res.status})`);

      await fetchMe();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Upload failed');
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onRemoveClick = async () => {
    // eslint-disable-next-line no-restricted-globals
    if (!confirm('Remove your profile picture?')) return;

    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/users/${user.user_id}/avatar`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const text = await res.text();
      let json = {};
      try {
        json = JSON.parse(text);
      } catch {}
      if (!res.ok) throw new Error(json?.error || `Delete failed (${res.status})`);

      await fetchMe();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    // clear auth locally
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    onUserUpdate?.(null);

    // let parent switch to login screen if provided
    if (typeof onLogout === 'function') {
      onLogout();
    } else {
      // fallback: reload so App shows LoginPage when no token
      window.location.reload();
    }
  };

  if (loading) {
    return (
      <Card className="border bg-card text-card-foreground shadow-sm rounded-2xl">
        <CardHeader className="pb-0 flex items-center justify-between">
          <CardTitle>My Profile</CardTitle>
          <button
            disabled
            className="rounded-md border px-3 py-1.5 text-sm opacity-60 cursor-not-allowed"
          >
            Logout
          </button>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          <Skeleton className="h-24 w-24 rounded-full" />
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-6 w-80" />
          <Skeleton className="h-6 w-56" />
        </CardContent>
      </Card>
    );
  }

  const initials = ((user?.first_name?.[0] || '') + (user?.last_name?.[0] || '')).toUpperCase();
  const hasAvatar = !!user?.avatar_url;

  return (
    <div className="max-w-screen-md mx-auto px-4">
      <Card className="border bg-card text-card-foreground shadow-sm rounded-2xl">
        <CardHeader className="pb-0 flex items-center justify-between">
          <CardTitle>My Profile</CardTitle>
          <button
            onClick={handleLogout}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            title="Log out"
          >
            Logout
          </button>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex items-start gap-6">
            {/* Avatar block */}
            <div className="flex flex-col items-center">
              <div className="h-28 w-28 rounded-full overflow-hidden bg-muted flex items-center justify-center text-xl font-medium">
                {hasAvatar ? (
                  <img src={user.avatar_url} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <span>{initials || '👤'}</span>
                )}
              </div>

              {!hasAvatar && (
                <button
                  onClick={onAddOrChangeClick}
                  disabled={saving}
                  className="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
                >
                  {saving ? 'Uploading…' : 'Add Photo'}
                </button>
              )}

              {hasAvatar && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={onAddOrChangeClick}
                    disabled={saving}
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
                  >
                    {saving ? 'Uploading…' : 'Change'}
                  </button>
                  <button
                    onClick={onRemoveClick}
                    disabled={saving}
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
                  >
                    {saving ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileSelected}
              />
            </div>

            {/* Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-3">
              <div>
                <div className="text-xs text-muted-foreground">Name</div>
                <div className="text-base font-medium">
                  {user.first_name} {user.last_name}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Email</div>
                <div className="text-base">{user.email}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Designation</div>
                <div className="text-base">{user.designation || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Role</div>
                <div className="text-base">{roleLabel(user.role_id)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
