import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Shield, KeyRound, User } from 'lucide-react';

export default function AdminSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [twoFactorQr, setTwoFactorQr] = useState('');
  const [twoFactorSecret, setTwoFactorSecret] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (!user) navigate('/');
  }, [user, navigate]);

  if (!user) return null;

  const onSetup2fa = async () => {
    setBusy(true);
    setMessage('');
    try {
      const data = await api.auth.setupTwoFactor();
      setTwoFactorQr(data.qrCodeDataUrl);
      setTwoFactorSecret(data.secret);
      setMessage('Scanne le QR code puis confirme avec un code.');
    } catch (error: any) {
      setMessage(error.message || 'Impossible de préparer la 2FA');
    } finally {
      setBusy(false);
    }
  };

  const onEnable2fa = async () => {
    if (!twoFactorCode) return;
    setBusy(true);
    setMessage('');
    try {
      await api.auth.enableTwoFactor(twoFactorCode);
      setMessage('2FA activée.');
      setTwoFactorCode('');
      setTwoFactorQr('');
      setTwoFactorSecret('');
      window.location.reload();
    } catch (error: any) {
      setMessage(error.message || 'Code 2FA invalide');
    } finally {
      setBusy(false);
    }
  };

  const onDisable2fa = async () => {
    if (!twoFactorCode) return;
    setBusy(true);
    setMessage('');
    try {
      await api.auth.disableTwoFactor(twoFactorCode);
      setMessage('2FA désactivée.');
      setTwoFactorCode('');
      window.location.reload();
    } catch (error: any) {
      setMessage(error.message || 'Code 2FA invalide');
    } finally {
      setBusy(false);
    }
  };

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await api.auth.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Mot de passe modifié.');
    } catch (error: any) {
      setMessage(error.message || 'Impossible de modifier le mot de passe');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 md:p-8 app-shell">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/admin')}
              className="bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-lg p-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Paramètres compte</h1>
              <p className="text-zinc-400 text-sm">Sécurité et informations de ton compte animateur</p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 app-card">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-400" />
            Compte
          </h2>
          <p className="text-zinc-400 mt-2 text-sm">Email: <span className="text-zinc-200">{user.email}</span></p>
          <p className="text-zinc-400 mt-1 text-sm">
            2FA: <span className={user.twoFactorEnabled ? 'text-emerald-400' : 'text-zinc-200'}>{user.twoFactorEnabled ? 'Active' : 'Inactive'}</span>
          </p>
        </div>

        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 space-y-4 app-card">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            Authentification 2FA
          </h2>

          {!user.twoFactorEnabled && (
            <button
              onClick={() => void onSetup2fa()}
              disabled={busy}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm"
            >
              Préparer la 2FA
            </button>
          )}

          {twoFactorQr && (
            <div className="bg-zinc-950 border border-white/10 rounded-xl p-4 flex flex-col md:flex-row gap-4">
              <img src={twoFactorQr} alt="QR code 2FA" className="w-40 h-40 bg-white rounded-lg p-2" />
              <div>
                <p className="text-zinc-300 text-sm">Secret de secours :</p>
                <code className="text-xs text-indigo-300 break-all">{twoFactorSecret}</code>
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
              placeholder="Code 2FA"
              className="flex-1 bg-zinc-950 border border-white/10 rounded-lg px-4 py-2"
            />
            {!user.twoFactorEnabled ? (
              <button onClick={() => void onEnable2fa()} disabled={busy} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 rounded-lg">
                Activer
              </button>
            ) : (
              <button onClick={() => void onDisable2fa()} disabled={busy} className="bg-red-600/20 hover:bg-red-600/30 border border-red-500/20 text-red-300 disabled:opacity-50 px-4 py-2 rounded-lg">
                Désactiver
              </button>
            )}
          </div>
        </div>

        <form onSubmit={onChangePassword} className="bg-zinc-900 border border-white/10 rounded-2xl p-5 space-y-4 app-card">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-indigo-400" />
            Changer le mot de passe
          </h2>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Mot de passe actuel"
            className="w-full bg-zinc-950 border border-white/10 rounded-lg px-4 py-2"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Nouveau mot de passe (min 8)"
            className="w-full bg-zinc-950 border border-white/10 rounded-lg px-4 py-2"
          />
          <button type="submit" disabled={busy} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 rounded-lg">
            Mettre à jour
          </button>
        </form>

        {message && (
          <div className="bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
