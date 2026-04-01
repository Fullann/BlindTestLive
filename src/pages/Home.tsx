import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { socket } from '../lib/socket';
import { Music, Play, Monitor, LogIn, Users } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const TEAMS = [
  { id: 'red', name: 'Équipe Rouge', color: 'bg-red-500' },
  { id: 'blue', name: 'Équipe Bleue', color: 'bg-blue-500' },
  { id: 'green', name: 'Équipe Verte', color: 'bg-green-500' },
  { id: 'yellow', name: 'Équipe Jaune', color: 'bg-yellow-500' },
];

export default function Home() {
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
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        // If they are an admin, they can go to dashboard
        // But we don't auto-redirect here to allow them to join as player if they want
      }
    });
    return unsubscribe;
  }, []);

  const handleCheckGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameCode) {
      setError('Veuillez entrer un code');
      return;
    }

    setLoading(true);
    socket.emit('game:check', gameCode.toUpperCase(), (response: any) => {
      setLoading(false);
      if (response.success) {
        setIsTeamMode(response.isTeamMode);
        setStep('details');
        setError('');
      } else {
        setError(response.error || 'Partie introuvable');
      }
    });
  };

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName) {
      setError('Veuillez entrer un pseudo');
      return;
    }
    if (isTeamMode && !team) {
      setError('Veuillez choisir une équipe');
      return;
    }

    // Get or create persistent player ID and secret
    let playerId = localStorage.getItem('blindtest_player_id');
    let playerSecret = localStorage.getItem('blindtest_player_secret');
    if (!playerId || !playerSecret) {
      playerId = uuidv4();
      playerSecret = uuidv4();
      localStorage.setItem('blindtest_player_id', playerId);
      localStorage.setItem('blindtest_player_secret', playerSecret);
    }
    
    // Save name and team for reconnection
    localStorage.setItem('blindtest_player_name', playerName);
    if (isTeamMode && team) {
      localStorage.setItem('blindtest_player_team', team);
    } else {
      localStorage.removeItem('blindtest_player_team');
    }

    setLoading(true);
    socket.emit('player:joinGame', { 
      gameId: gameCode.toUpperCase(), 
      playerId,
      playerSecret,
      name: playerName,
      team: isTeamMode ? team : undefined
    }, (response: any) => {
      setLoading(false);
      if (response.success) {
        navigate(`/game/${gameCode.toUpperCase()}`);
      } else {
        setError(response.error || 'Erreur lors de la connexion');
      }
    });
  };

  const handleAdminLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      navigate('/admin');
    } catch (err) {
      console.error(err);
      setError('Erreur de connexion');
    }
  };

  const handleCohostAccess = (e: React.FormEvent) => {
    e.preventDefault();
    const safeCode = cohostGameCode.trim().toUpperCase();
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
      localStorage.setItem(`blindtest_host_${safeCode}`, safeToken);
      navigate(`/admin/game/${safeCode}`);
    });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mb-4">
            <Music className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Blind Test Live</h1>
          <p className="mt-2 text-zinc-400">Rejoignez une partie en cours</p>
        </div>

        <form onSubmit={step === 'code' ? handleCheckGame : handleJoinGame} className="bg-zinc-900 p-8 rounded-2xl border border-white/5 shadow-xl space-y-6">
          {error && (
            <div className="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm text-center">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            {step === 'code' ? (
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Code de la partie</label>
                <input
                  type="text"
                  maxLength={6}
                  value={gameCode}
                  onChange={(e) => setGameCode(e.target.value.toUpperCase())}
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
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Choisissez votre équipe</label>
                    <div className="grid grid-cols-2 gap-2">
                      {TEAMS.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTeam(t.id)}
                          className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                            team === t.id 
                              ? 'border-white/50 bg-white/10' 
                              : 'border-white/5 bg-zinc-950 hover:bg-zinc-800'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full ${t.color}`} />
                          <span className="text-sm font-medium">{t.name}</span>
                        </button>
                      ))}
                    </div>
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
                {loading ? 'Vérification...' : 'Continuer'}
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

        <div className="flex flex-col gap-4">
          <button
            onClick={() => {
              if (gameCode) {
                navigate(`/screen/${gameCode.toUpperCase()}`);
              } else {
                setError('Veuillez entrer un code de partie pour ouvrir l\'écran public');
              }
            }}
            className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-2 transition-colors"
          >
            <Monitor className="w-4 h-4" />
            Ouvrir l'écran public (TV)
          </button>
          
          <button
            onClick={handleAdminLogin}
            className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-2 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Espace Animateur
          </button>

          <button
            onClick={() => setShowCohostAccess((v) => !v)}
            className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-2 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Accès Co-animateur par token
          </button>

          {showCohostAccess && (
            <form onSubmit={handleCohostAccess} className="bg-zinc-900 border border-white/5 rounded-xl p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Code de la partie</label>
                <input
                  type="text"
                  maxLength={6}
                  value={cohostGameCode}
                  onChange={(e) => setCohostGameCode(e.target.value.toUpperCase())}
                  className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="ABCDEF"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Token co-animateur</label>
                <input
                  type="text"
                  value={cohostToken}
                  onChange={(e) => setCohostToken(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Collez le token reçu"
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
      </div>
    </div>
  );
}
