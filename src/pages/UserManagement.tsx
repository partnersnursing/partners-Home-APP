import React, { useState, useEffect, useRef } from 'react';
import { supabase, Profile, UserRole } from '../services/supabase';
import { Button } from '../components/Button';
import { ConfirmationModal } from '../components/ConfirmationModal';
import {
  UserPlus, Shield, Mail, User as UserIcon, Trash2, AlertCircle,
  Eye, EyeOff, Download, ChevronDown, Pencil, CheckCircle
} from 'lucide-react';

// ── Role definitions ─────────────────────────────────────────────────────────
const ROLE_ACCESS: Record<string, { label: string; color: string; access: string[] }> = {
  admin: {
    label: 'Admin',
    color: 'bg-purple-100 text-purple-700',
    access: [
      'Dashboard', 'Patients (Full CRUD)', 'Patient Profiles', 'Medical Providers',
      'Referrals', 'Schedule', 'Clinical Notes', 'Clinical Forms (All)',
      'Compliance Dashboard', 'User Management', 'Staff Management',
      'Download PDF Reports', 'Delete Records',
    ],
  },
  manager: {
    label: 'Manager',
    color: 'bg-blue-100 text-blue-700',
    access: [
      'Dashboard', 'Patients (Full CRUD)', 'Patient Profiles', 'Medical Providers',
      'Referrals', 'Schedule', 'Clinical Notes', 'Clinical Forms (All)',
      'Compliance Dashboard', 'Staff Management', 'Download PDF Reports',
    ],
  },
  care_manager: {
    label: 'Care Manager',
    color: 'bg-teal-100 text-teal-700',
    access: [
      'Dashboard', 'Patients (View + Edit)', 'Patient Profiles', 'Medical Providers',
      'Referrals', 'Schedule', 'Clinical Notes', 'Clinical Forms (All)',
      'Download PDF Reports',
    ],
  },
  nurse: {
    label: 'Nurse',
    color: 'bg-green-100 text-green-700',
    access: [
      'Dashboard', 'Patients (View + Edit)', 'Patient Profiles', 'Medical Providers',
      'Referrals', 'Clinical Notes', 'Clinical Forms (All)', 'Download PDF Reports',
    ],
  },
  frontdesk: {
    label: 'Front Desk',
    color: 'bg-yellow-100 text-yellow-700',
    access: [
      'Dashboard', 'Patients (View Only)', 'Patient Profiles (View)',
      'Medical Providers', 'Referrals', 'Schedule',
    ],
  },
  reviewer: {
    label: 'Reviewer',
    color: 'bg-orange-100 text-orange-700',
    access: [
      'Dashboard', 'Clinical Notes (View)', 'Clinical Forms (View)',
      'Compliance Dashboard', 'Download PDF Reports',
    ],
  },
};

// ── Status Dropdown ───────────────────────────────────────────────────────────
const StatusDropdown: React.FC<{
  user: Profile;
  onToggle: (user: Profile, status: boolean) => void;
  isLoading: boolean;
}> = ({ user, onToggle, isLoading }) => {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropUp(window.innerHeight - rect.bottom < 100);
    }
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        disabled={isLoading}
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold cursor-pointer border transition-all ${
          user.is_active
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
        {isLoading ? 'Updating...' : user.is_active ? 'Active' : 'Inactive'}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          ref={menuRef}
          className={`absolute left-0 w-36 bg-white rounded-2xl border border-zinc-200 shadow-xl z-[999] overflow-hidden ${
            dropUp ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          <button
            onClick={() => { onToggle(user, true); setOpen(false); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
          </button>
          <button
            onClick={() => { onToggle(user, false); setOpen(false); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-red-700 hover:bg-red-50 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Inactive
          </button>
        </div>
      )}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal visibility
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRoleAccessModal, setShowRoleAccessModal] = useState(false);

  // Delete
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Status toggle
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  // ── Create form state ──────────────────────────────────────────────────────
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createFullName, setCreateFullName] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('care_manager');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Edit form state ────────────────────────────────────────────────────────
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('care_manager');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setUsers(data);
    setLoading(false);
  };

  // ── Open edit modal, pre-fill fields ──────────────────────────────────────
  const openEditModal = (user: Profile) => {
    setEditUser(user);
    setEditFullName(user.full_name || '');
    setEditRole(user.role as UserRole);
    setEditPassword('');
    setEditError(null);
    setEditSuccess(false);
    setShowEditPassword(false);
    setShowEditModal(true);
  };

  // ── Create user ───────────────────────────────────────────────────────────
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: createEmail, password: createPassword, fullName: createFullName, role: createRole }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create user');
      setShowAddModal(false);
      setCreateEmail(''); setCreatePassword(''); setCreateFullName('');
      fetchUsers();
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  // ── Edit user ─────────────────────────────────────────────────────────────
  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setEditing(true);
    setEditError(null);
    setEditSuccess(false);
    try {
      const response = await fetch('/api/admin/edit-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editUser.id,
          fullName: editFullName,
          role: editRole,
          password: editPassword.trim() || undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to update user');

      // Update local state immediately
      setUsers(prev =>
        prev.map(u =>
          u.id === editUser.id
            ? { ...u, full_name: editFullName, role: editRole as UserRole }
            : u
        )
      );
      setEditSuccess(true);
      // Auto-close after 1.5s on success
      setTimeout(() => {
        setShowEditModal(false);
        setEditUser(null);
      }, 1500);
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setEditing(false);
    }
  };

  // ── Delete user ───────────────────────────────────────────────────────────
  const handleDeleteUser = async (userId: string) => {
    setDeleteError(null);
    setIsDeleting(true);
    try {
      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to delete user');
      fetchUsers();
      setUserToDelete(null);
    } catch (err: any) {
      setDeleteError(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Toggle status ─────────────────────────────────────────────────────────
  const handleToggleStatus = async (user: Profile, newStatus: boolean) => {
    setUpdatingStatus(user.id);
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: newStatus })
      .eq('id', user.id);

    if (!error) {
      if (!newStatus) {
        await fetch('/api/admin/deactivate-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        }).catch(() => {});
      }
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: newStatus } : u));
    }
    setUpdatingStatus(null);
  };

  const handleExportRoleAccess = () => {
    const lines: string[] = [
      'PARTNERS HOME NURSING SERVICES',
      'ROLE ACCESS PERMISSIONS',
      `Generated: ${new Date().toLocaleDateString()}`,
      '='.repeat(60), '',
    ];
    Object.entries(ROLE_ACCESS).forEach(([, { label, access }]) => {
      lines.push(`ROLE: ${label.toUpperCase()}`);
      lines.push('-'.repeat(40));
      access.forEach(item => lines.push(`  • ${item}`));
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'Role_Access_List.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  const roleFmt = (r: string) => ROLE_ACCESS[r]?.label || r.replace('_', ' ');

  const inputClass = 'w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none transition-all text-sm';

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-partners-blue-dark italic">User Management</h2>
          <p className="text-sm md:text-base text-partners-gray">Manage clinical staff and system access roles.</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto flex-wrap">
          <Button variant="secondary" className="rounded-full px-4" onClick={() => setShowRoleAccessModal(true)}>
            <Shield className="w-4 h-4 mr-2" /> Role Access
          </Button>
          <Button variant="secondary" className="rounded-full px-4" onClick={handleExportRoleAccess}>
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
          <Button className="rounded-full px-6 flex-1 sm:flex-none" onClick={() => setShowAddModal(true)}>
            <UserPlus className="w-4 h-4 mr-2" /> Add New User
          </Button>
        </div>
      </div>

      {/* Delete error banner */}
      {deleteError && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600">
          <AlertCircle size={18} />
          <p className="text-sm font-medium">{deleteError}</p>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setDeleteError(null)}>Dismiss</Button>
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-visible">
        <table className="w-full text-left border-collapse">
          <thead className="bg-zinc-50 border-b border-zinc-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider rounded-tl-3xl">User</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider text-right rounded-tr-3xl">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4"><div className="h-4 bg-zinc-100 rounded w-32" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-zinc-100 rounded w-24" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-zinc-100 rounded w-16" /></td>
                  <td className="px-6 py-4" />
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-12 text-center text-zinc-500">No users found.</td></tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-zinc-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${user.is_active ? 'bg-partners-blue-dark/10 text-partners-blue-dark' : 'bg-zinc-100 text-zinc-400'}`}>
                        {user.full_name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-zinc-900">{user.full_name}</p>
                        <p className="text-xs text-zinc-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${ROLE_ACCESS[user.role]?.color || 'bg-zinc-100 text-zinc-600'}`}>
                      {roleFmt(user.role)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusDropdown user={user} onToggle={handleToggleStatus} isLoading={updatingStatus === user.id} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost" size="sm"
                        className="text-partners-blue-dark hover:bg-partners-blue-dark/10"
                        onClick={() => openEditModal(user)}
                        title="Edit user"
                      >
                        <Pencil size={15} />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="text-red-500 hover:bg-red-50"
                        onClick={() => setUserToDelete({ id: user.id, name: user.full_name })}
                        title="Delete user"
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-white rounded-3xl border border-zinc-200 animate-pulse" />
          ))
        ) : users.map((user) => (
          <div key={user.id} className="bg-white p-4 rounded-3xl border border-zinc-200 shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${user.is_active ? 'bg-partners-blue-dark/10 text-partners-blue-dark' : 'bg-zinc-100 text-zinc-400'}`}>
                  {user.full_name?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-zinc-900">{user.full_name}</p>
                  <p className="text-xs text-zinc-500">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="text-partners-blue-dark" onClick={() => openEditModal(user)}>
                  <Pencil size={15} />
                </Button>
                <Button variant="ghost" size="sm" className="text-red-500"
                  onClick={() => setUserToDelete({ id: user.id, name: user.full_name })}>
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-zinc-50">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${ROLE_ACCESS[user.role]?.color || 'bg-zinc-100 text-zinc-600'}`}>
                {roleFmt(user.role)}
              </span>
              <StatusDropdown user={user} onToggle={handleToggleStatus} isLoading={updatingStatus === user.id} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Create User Modal ──────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl border border-zinc-200 w-full max-w-md p-6 sm:p-8">
            <h3 className="text-xl font-bold text-zinc-900 mb-6">Create New User</h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Full Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input type="text" value={createFullName} onChange={e => setCreateFullName(e.target.value)}
                    className={inputClass} placeholder="Dr. Jane Smith" required />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input type="email" value={createEmail} onChange={e => setCreateEmail(e.target.value)}
                    className={inputClass} placeholder="doctor@clinic.com" required />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Initial Password</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    value={createPassword}
                    onChange={e => setCreatePassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none text-sm"
                    placeholder="••••••••" required
                  />
                  <button type="button" onClick={() => setShowCreatePassword(!showCreatePassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-1">
                    {showCreatePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">System Role</label>
                <select value={createRole} onChange={e => setCreateRole(e.target.value as UserRole)}
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white text-sm">
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="care_manager">Care Manager</option>
                  <option value="nurse">Nurse</option>
                  <option value="frontdesk">Front Desk</option>
                  <option value="reviewer">Reviewer</option>
                </select>
              </div>
              {createError && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{createError}</p>}
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowAddModal(false)}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={creating}>{creating ? 'Creating...' : 'Create User'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ────────────────────────────────────────────────── */}
      {showEditModal && editUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl border border-zinc-200 w-full max-w-md p-6 sm:p-8">

            {/* Modal header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-partners-blue-dark/10 text-partners-blue-dark flex items-center justify-center font-bold text-sm shrink-0">
                {editUser.full_name?.[0]?.toUpperCase()}
              </div>
              <div>
                <h3 className="text-xl font-bold text-zinc-900">Edit User</h3>
                <p className="text-xs text-zinc-400">{editUser.email}</p>
              </div>
            </div>

            <form onSubmit={handleEditUser} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">Full Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input
                    type="text"
                    value={editFullName}
                    onChange={e => setEditFullName(e.target.value)}
                    className={inputClass}
                    placeholder="Full name"
                    required
                  />
                </div>
              </div>

              {/* Role */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">System Role</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <select
                    value={editRole}
                    onChange={e => setEditRole(e.target.value as UserRole)}
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none bg-white text-sm"
                  >
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="care_manager">Care Manager</option>
                    <option value="nurse">Nurse</option>
                    <option value="frontdesk">Front Desk</option>
                    <option value="reviewer">Reviewer</option>
                  </select>
                </div>
              </div>

              {/* New Password (optional) */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700">
                  New Password
                  <span className="ml-2 text-xs text-zinc-400 font-normal">(leave blank to keep current)</span>
                </label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    value={editPassword}
                    onChange={e => setEditPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-partners-blue-dark outline-none text-sm"
                    placeholder="••••••••"
                    minLength={editPassword.length > 0 ? 6 : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-1"
                  >
                    {showEditPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {editPassword.length > 0 && editPassword.length < 6 && (
                  <p className="text-xs text-amber-600">Password must be at least 6 characters</p>
                )}
              </div>

              {/* Feedback */}
              {editError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <AlertCircle size={16} className="text-red-500 shrink-0" />
                  <p className="text-sm text-red-600">{editError}</p>
                </div>
              )}
              {editSuccess && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <CheckCircle size={16} className="text-emerald-500 shrink-0" />
                  <p className="text-sm text-emerald-700 font-medium">User updated successfully!</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button" variant="secondary" className="flex-1"
                  onClick={() => { setShowEditModal(false); setEditUser(null); }}
                  disabled={editing}
                >
                  Cancel
                </Button>
                <Button
                  type="submit" className="flex-1"
                  disabled={editing || editSuccess || (editPassword.length > 0 && editPassword.length < 6)}
                >
                  {editing ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Role Access Modal ──────────────────────────────────────────────── */}
      {showRoleAccessModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl border border-zinc-200 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-zinc-100">
              <h3 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                <Shield className="text-partners-blue-dark" size={20} /> Role Access Permissions
              </h3>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={handleExportRoleAccess}>
                  <Download size={14} className="mr-1" /> Export
                </Button>
                <button onClick={() => setShowRoleAccessModal(false)} className="text-zinc-400 hover:text-zinc-600 p-1 text-lg leading-none">✕</button>
              </div>
            </div>
            <div className="overflow-y-auto p-6 space-y-4">
              {Object.entries(ROLE_ACCESS).map(([key, { label, color, access }]) => (
                <div key={key} className="border border-zinc-100 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-3 p-4 bg-zinc-50">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${color}`}>{label}</span>
                    <span className="text-xs text-zinc-400">{access.length} permissions</span>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {access.map(item => (
                      <div key={item} className="flex items-center gap-2 text-xs text-zinc-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-partners-green shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ────────────────────────────────────────────── */}
      <ConfirmationModal
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        onConfirm={() => userToDelete && handleDeleteUser(userToDelete.id)}
        title="Delete User"
        message={`Are you sure you want to delete ${userToDelete?.name}? This will permanently remove their access.`}
        confirmText="Delete User"
        isLoading={isDeleting}
      />
    </div>
  );
};