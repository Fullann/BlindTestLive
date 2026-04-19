import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { socket } from '../lib/socket';
import { LogIn, Monitor, Music, Play, Radio, ShieldCheck, Sparkles, Store, Users, Zap } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function Home() {
  const { register } = useAuth();
  const [gameCode, setGameCode] = useState('');
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('blindtest_player_name') || '');
  const [team, setTeam] = useState(() => localStorage.getItem('blindtest_player_team') || '');
  const [isTeamMode, setIsTeamMode] = useState(false);
  const [step, setStep] = useState<'code' | 'details'>('code');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cohostGameCode, setCohostGameCode] = useState('');
  const [cohostToken, setCohostToken] = useState('');
  const [cohostLoading, setCohostLoading] = useState(false);
  const [showCohostAccess, setShowCohostAccess] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<Array<{ id: string; name: string; color: string; enabled: boolean }>>([]);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminTwoFactorCode, setAdminTwoFactorCode] = useState('');
  const [adminNeedsTwoFactor, setAdminNeedsTwoFactor] = useState(false);
  const [adminMode, setAdminMode] = useState<'login' | 'signup'>('login');
  const [adminLoading, setAdminLoading] = useState(false);
  const navigate = useNavigate();

  const normalizeGameCode = (value: string) => value.replace(/\s+/g, '').trim().toUpperCase();

  useEffect(() => {
    const savedGameId = normalizeGameCode(localStorage.getItem('blindtest_last_game_id') || '');
    const playerId = localStorage.getItem('blindtest_player_id');
    const playerSecret = localStorage.getItem('blindtest_player_secret');
    const savedName = localStorage.getItem('blindtest_player_name');
    const savedTeam = localStorage.getItem('blindtest_player_team') || undefined;

    if (!savedGameId || !playerId || !playerSecret || !savedName) return;

    setLoading(true);
    socket.emit('game:check', savedGameId, (checkResponse: any) => {
      if (!checkResponse?.success) {
        localStorage.removeItem('blindtest_last_game_id');
        setLoading(false);
        return;
      }
      if (checkResponse?.status === 'finished') {
        localStorage.removeItem('blindtest_last_game_id');
        setLoading(false);
        return;
      }
      socket.emit(
        'player:joinGame',
        {
          gameId: savedGameId,
          playerId,
          playerSecret,
          name: savedName,
          team: savedTeam,
        },
        (joinResponse: any) => {
          setLoading(false);
          if (joinResponse?.success) {
            navigate(`/game/${savedGameId}`);
          }
        },
      );
    });
  }, [navigate]);

  const handleCheckGame = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedCode = normalizeGameCode(gameCode);
    if (!normalizedCode) {
      setError('Veuillez entrer un code');
      return;
    }

    setLoading(true);
    socket.emit('game:check', normalizedCode, (response: any) => {
      setLoading(false);
      if (response.success) {
        if (response.status === 'finished') {
          setError('Cette partie est déjà terminée.');
          return;
        }
        setIsTeamMode(response.isTeamMode);
        const teams = Array.isArray(response.teamConfig) ? response.teamConfig.filter((t: any) => t?.enabled) : [];
        setAvailableTeams(teams);
        if (teams.length > 0 && !teams.some((t: any) => t.id === team)) {
          setTeam('');
        }
        setStep('details');
        setError('');
      } else {
        setError(response.error || 'Partie introuvable');
      }
    });
  };

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedCode = normalizeGameCode(gameCode);
    if (!normalizedCode) {
      setError('Veuillez entrer un code');
      return;
    }
    if (!playerName) {
      setError('Veuillez entrer un pseudo');
      return;
    }
    if (isTeamMode && availableTeams.length > 0 && !team) {
      setError('Veuillez choisir une equipe');
      return;
    }

    let playerId = localStorage.getItem('blindtest_player_id');
    let playerSecret = localStorage.getItem('blindtest_player_secret');
    if (!playerId || !playerSecret) {
      playerId = uuidv4();
      playerSecret = uuidv4();
      localStorage.setItem('blindtest_player_id', playerId);
      localStorage.setItem('blindtest_player_secret', playerSecret);
    }

    localStorage.setItem('blindtest_player_name', playerName);
    if (isTeamMode && team) {
      localStorage.setItem('blindtest_player_team', team);
    } else {
      localStorage.removeItem('blindtest_player_team');
    }

    setLoading(true);
    socket.emit(
      'player:joinGame',
      {
        gameId: normalizedCode,
        playerId,
        playerSecret,
        name: playerName,
        team: isTeamMode && availableTeams.length > 0 ? team : undefined,
      },
      (response: any) => {
        setLoading(false);
        if (response.success) {
          localStorage.setItem('blindtest_last_game_id', normalizedCode);
          navigate(`/game/${normalizedCode}`);
        } else {
          setError(response.error || 'Erreur lors de la connexion');
        }
      },
    );
  };

  const handleAdminAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail || !adminPassword) {
      setError('Veuillez remplir tous les champs');
      return;
    }
    setAdminLoading(true);
    setError('');
    try {
      if (adminMode === 'login') {
        const result = await api.auth.login(adminEmail, adminPassword);
        if (result.requiresTwoFactor) {
          setAdminNeedsTwoFactor(true);
          return;
        }
        if (!result.user) {
          throw new Error('Connexion impossible');
        }
      } else {
        await register(adminEmail, adminPassword);
      }
      navigate('/admin');
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleAdminTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminTwoFactorCode) {
      setError('Veuillez saisir le code 2FA');
      return;
    }
    setAdminLoading(true);
    setError('');
    try {
      await api.auth.verifyLogin2fa(adminTwoFactorCode);
      navigate('/admin');
    } catch (err: any) {
      setError(err.message || 'Code 2FA invalide');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleCohostAccess = (e: React.FormEvent) => {
    e.preventDefault();
    const safeCode = normalizeGameCode(cohostGameCode);
    const safeToken = cohostToken.trim();

    if (!safeCode) {
      setError('Veuillez entrer un code de partie co-animateur');
      return;
    }
    if (!safeToken) {
      setError('Veuillez entrer un token co-animateur');
      return;
    }

    setCohostLoading(true);
    socket.emit('host:joinGame', { gameId: safeCode, hostToken: safeToken }, (response: any) => {
      setCohostLoading(false);
      if (!response.success) {
        setError(response.error || 'Token co-animateur invalide');
        return;
      }
      sessionStorage.setItem(`blindtest_host_${safeCode}`, safeToken);
      navigate(`/admin/game/${safeCode}`);
    });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-8 app-shell">
      <div className="mx-auto max-w-6xl">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-600/20 via-fuchsia-600/10 to-zinc-900 p-8 md:p-12 mb-8">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-zinc-300 mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              Experience multi-ecrans en temps reel
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-tight">Blind Test Live</h1>
            <p className="mt-4 max-w-3xl text-zinc-200 md:text-lg">
              Une app pour animer des blind tests modernes: les joueurs buzzent depuis leur mobile, l&apos;animateur pilote la partie en direct, et l&apos;ecran public affiche medias, classement et podium.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <span className="rounded-full bg-white/10 px-3 py-1 border border-white/10">Musique</span>
              <span className="rounded-full bg-white/10 px-3 py-1 border border-white/10">Films & Series</span>
              <span className="rounded-full bg-white/10 px-3 py-1 border border-white/10">YouTube</span>
              <span className="rounded-full bg-white/10 px-3 py-1 border border-white/10">Mode equipe</span>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <article className="rounded-2xl border border-white/10 bg-zinc-900/80 p-5 app-card">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center mb-3">
                  <Users className="w-5 h-5" />
                </div>
                <h2 className="font-semibold mb-1">Cote joueurs</h2>
                <p className="text-sm text-zinc-400">Connexion rapide avec code, buzzer live, score en temps reel et reconnexion automatique.</p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-zinc-900/80 p-5 app-card">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center mb-3">
                  <Radio className="w-5 h-5" />
                </div>
                <h2 className="font-semibold mb-1">Cote animateur</h2>
                <p className="text-sm text-zinc-400">Creation des parties, gestion des manches, attribution des points et controle des joueurs.</p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-zinc-900/80 p-5 app-card">
                <div className="w-10 h-10 rounded-xl bg-fuchsia-500/20 text-fuchsia-300 flex items-center justify-center mb-3">
                  <Monitor className="w-5 h-5" />
                </div>
                <h2 className="font-semibold mb-1">Ecran public</h2>
                <p className="text-sm text-zinc-400">Affichage TV avec QR code, compte a rebours, media en cours, classement et podium final.</p>
              </article>
            </div>

            <section className="rounded-2xl border border-white/10 bg-zinc-900/80 p-6 app-card">
              <h3 className="text-lg font-semibold mb-4">Pourquoi cette app ?</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="rounded-xl bg-zinc-950/80 border border-white/5 p-4">
                  <Zap className="w-4 h-4 text-indigo-300 mb-2" />
                  <p className="text-zinc-300">Animation fluide, interactive et synchronisee sans installation cote joueurs.</p>
                </div>
                <div className="rounded-xl bg-zinc-950/80 border border-white/5 p-4">
                  <Music className="w-4 h-4 text-emerald-300 mb-2" />
                  <p className="text-zinc-300">Support de plusieurs sources media: playlist perso, YouTube, audio, video, image, voix.</p>
                </div>
                <div className="rounded-xl bg-zinc-950/80 border border-white/5 p-4">
                  <ShieldCheck className="w-4 h-4 text-fuchsia-300 mb-2" />
                  <p className="text-zinc-300">Gestion des acces hote/co-hote et reconnexion securisee des participants.</p>
                </div>
              </div>
            </section>
          </div>

          <aside className="lg:col-span-2">
            <div className="bg-zinc-900 p-8 rounded-2xl border border-white/10 shadow-xl space-y-6 lg:sticky lg:top-6 app-card">
              {!showAdminLogin ? (
                <>
                  <form onSubmit={step === 'code' ? handleCheckGame : handleJoinGame} className="space-y-6">
                    <div>
                      <h2 className="text-xl font-bold">{step === 'code' ? 'Rejoindre une partie' : 'Finaliser votre connexion'}</h2>
                      <p className="text-sm text-zinc-400 mt-1">
                        {step === 'code' ? 'Entrez le code de partie pour continuer.' : 'Choisissez votre pseudo et entrez dans la manche.'}
                      </p>
                    </div>

                    {error && <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm text-center">{error}</div>}

                    <div className="space-y-4">
                      {step === 'code' ? (
                        <div>
                          <label className="block text-sm font-medium text-zinc-400 mb-1">Code de la partie</label>
                          <input
                            type="text"
                            maxLength={6}
                            value={gameCode}
                            onChange={(e) => setGameCode(normalizeGameCode(e.target.value))}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            placeholder="ABCDEF"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Votre pseudo</label>
                            <input
                              type="text"
                              value={playerName}
                              onChange={(e) => setPlayerName(e.target.value)}
                              className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                              placeholder="Ex: Mozart"
                              autoFocus
                            />
                          </div>
                          {isTeamMode && (
                            <div>
                              <label className="block text-sm font-medium text-zinc-400 mb-2">Choisissez votre equipe</label>
                              {availableTeams.length === 0 ? (
                                <p className="text-sm text-zinc-500">Aucune équipe active n&apos;est configurée pour cette partie.</p>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  {availableTeams.map((t) => (
                                    <button
                                      key={t.id}
                                      type="button"
                                      onClick={() => setTeam(t.id)}
                                      className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                                        team === t.id ? 'border-white/50 bg-white/10' : 'border-white/5 bg-zinc-950 hover:bg-zinc-800'
                                      }`}
                                    >
                                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color }} />
                                      <span className="text-sm font-medium">{t.name}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {step === 'code' ? (
                        <>
                          <Play className="w-5 h-5" />
                          {loading ? 'Verification...' : 'Continuer'}
                        </>
                      ) : (
                        <>
                          <Users className="w-5 h-5" />
                          {loading ? 'Connexion...' : 'Rejoindre la partie'}
                        </>
                      )}
                    </button>

                    {step === 'details' && (
                      <button
                        type="button"
                        onClick={() => setStep('code')}
                        className="w-full text-zinc-500 hover:text-zinc-300 text-sm mt-2 transition-colors"
                      >
                        Changer de code
                      </button>
                    )}
                  </form>

                  <div className="pt-2 border-t border-white/10 flex flex-col gap-3">
                    <button
                      onClick={() => navigate('/store')}
                      type="button"
                      className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-2 transition-colors"
                    >
                      <Store className="w-4 h-4" />
                      Magasin Blind Test
                    </button>

                    <button
                      onClick={() => {
                        if (gameCode) {
                          navigate(`/screen/${gameCode.toUpperCase()}`);
                        } else {
                          setError("Veuillez entrer un code de partie pour ouvrir l'ecran public");
                        }
                      }}
                      type="button"
                      className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-2 transition-colors"
                    >
                      <Monitor className="w-4 h-4" />
                      Ouvrir l&apos;ecran public (TV)
                    </button>

                    <button
                      onClick={() => { setShowAdminLogin(true); setError(''); }}
                      type="button"
                      className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-2 transition-colors"
                    >
                      <LogIn className="w-4 h-4" />
                      Espace Animateur
                    </button>

                    <button
                      onClick={() => setShowCohostAccess((v) => !v)}
                      type="button"
                      className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-2 transition-colors"
                    >
                      <LogIn className="w-4 h-4" />
                      Acces Co-animateur par token
                    </button>

                    {showCohostAccess && (
                      <form onSubmit={handleCohostAccess} className="bg-zinc-950 border border-white/10 rounded-xl p-4 space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-zinc-400 mb-1">Code de la partie</label>
                          <input
                            type="text"
                            maxLength={6}
                            value={cohostGameCode}
                            onChange={(e) => setCohostGameCode(normalizeGameCode(e.target.value))}
                            className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="ABCDEF"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-400 mb-1">Token co-animateur</label>
                          <input
                            type="text"
                            value={cohostToken}
                            onChange={(e) => setCohostToken(e.target.value)}
                            className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Collez le token recu"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={cohostLoading}
                          className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {cohostLoading ? 'Connexion...' : 'Se connecter en co-animateur'}
                        </button>
                      </form>
                    )}
                  </div>
                </>
              ) : (
                <form onSubmit={adminNeedsTwoFactor ? handleAdminTwoFactor : handleAdminAuth} className="space-y-5">
                  <div>
                    <h2 className="text-xl font-bold">Espace Animateur</h2>
                    <p className="text-sm text-zinc-400 mt-1">Connectez-vous pour gerer vos blind tests.</p>
                  </div>

                  {error && <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm text-center">{error}</div>}

                  {!adminNeedsTwoFactor && (
                    <div className="flex rounded-xl border border-white/10 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setAdminMode('login')}
                        className={`flex-1 py-2 text-sm font-medium transition-colors ${adminMode === 'login' ? 'bg-indigo-600 text-white' : 'bg-zinc-950 text-zinc-400 hover:text-white'}`}
                      >
                        Connexion
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminMode('signup')}
                        className={`flex-1 py-2 text-sm font-medium transition-colors ${adminMode === 'signup' ? 'bg-indigo-600 text-white' : 'bg-zinc-950 text-zinc-400 hover:text-white'}`}
                      >
                        Inscription
                      </button>
                    </div>
                  )}

                  <div className="space-y-3">
                    {!adminNeedsTwoFactor ? (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-zinc-400 mb-1">Email</label>
                          <input
                            type="email"
                            value={adminEmail}
                            onChange={(e) => setAdminEmail(e.target.value)}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            placeholder="votre@email.com"
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-zinc-400 mb-1">Mot de passe</label>
                          <input
                            type="password"
                            value={adminPassword}
                            onChange={(e) => setAdminPassword(e.target.value)}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            placeholder="••••••••"
                          />
                        </div>
                      </>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Code 2FA</label>
                        <input
                          type="text"
                          value={adminTwoFactorCode}
                          onChange={(e) => setAdminTwoFactorCode(e.target.value)}
                          className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                          placeholder="123456"
                          autoFocus
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={adminLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <LogIn className="w-5 h-5" />
                    {adminLoading ? 'Chargement...' : (adminNeedsTwoFactor ? 'Valider le code 2FA' : (adminMode === 'login' ? 'Se connecter' : "S'inscrire"))}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminLogin(false);
                      setError('');
                      setAdminNeedsTwoFactor(false);
                      setAdminTwoFactorCode('');
                    }}
                    className="w-full text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                  >
                    Retour
                  </button>
                </form>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
