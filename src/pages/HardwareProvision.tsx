import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

/* ─────────────────────────── types ─────────────────────────── */
interface ProvConfig {
  serverHost: string;
  serverPort: number;
}

type Step = 'idle' | 'connected' | 'sending' | 'done' | 'error';
type SerialPortLike = {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

const BAUD_RATE = 115200;

/* ── générateur d'ID de device ── */
function generateDeviceId() {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `TOTEM-${rand}`;
}

/* ─────────────────────────── composant ─────────────────────── */
export default function HardwareProvision() {
  const navigate = useNavigate();

  const [config, setConfig] = useState<ProvConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [deviceId, setDeviceId] = useState(generateDeviceId);
  const [deviceName, setDeviceName] = useState('');
  const [serverHost, setServerHost] = useState('');
  const [serverPort, setServerPort] = useState('');

  const [step, setStep] = useState<Step>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [serialOutput, setSerialOutput] = useState<string[]>([]);
  const [showPass, setShowPass] = useState(false);

  const portRef = useRef<SerialPortLike | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const serialEndRef = useRef<HTMLDivElement>(null);

  /* Récupération config serveur */
  useEffect(() => {
    api.hardware
      .provisionConfig()
      .then((c) => {
        setConfig(c);
        setServerHost(c.serverHost);
        setServerPort(String(c.serverPort));
      })
      .catch(() => {
        pushLog('⚠️ Impossible de récupérer la config serveur – remplissez manuellement.');
      })
      .finally(() => setLoadingConfig(false));
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  useEffect(() => {
    serialEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serialOutput]);

  function pushLog(msg: string) {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }

  /* ── Connexion USB ── */
  async function connectSerial() {
    if (!('serial' in navigator)) {
      pushLog('❌ Web Serial API non supportée. Utilisez Chrome ou Edge.');
      setStep('error');
      return;
    }
    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: BAUD_RATE });
      portRef.current = port;

      // Writer
      const textEncoder = new TextEncoderStream();
      textEncoder.readable.pipeTo(port.writable);
      writerRef.current = textEncoder.writable.getWriter();

      // Reader (lecture continue de la sortie série)
      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      readerRef.current = textDecoder.readable.getReader();
      readLoop();

      setStep('connected');
      pushLog('✅ Totem connecté via USB (Serial).');
    } catch (err: any) {
      pushLog(`❌ Connexion échouée : ${err?.message ?? err}`);
      setStep('error');
    }
  }

  async function readLoop() {
    const reader = readerRef.current;
    if (!reader) return;
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) setSerialOutput((prev) => [...prev.slice(-200), trimmed]);
        }
      }
    } catch {
      // port fermé – normal
    }
  }

  /* ── Envoi de la config ── */
  async function sendConfig() {
    if (!writerRef.current) return;
    if (!ssid) { pushLog('⚠️ Le nom du réseau WiFi (SSID) est requis.'); return; }
    if (!deviceId) { pushLog('⚠️ L\'identifiant du totem est requis.'); return; }
    if (!serverHost) { pushLog('⚠️ L\'adresse du serveur est requise.'); return; }

    try {
      setStep('sending');

      // 1. Enregistrement du totem sur le serveur → génère un secret unique
      const name = deviceName.trim() || deviceId;
      pushLog(`🔑 Enregistrement du totem "${name}" sur le serveur…`);
      const { secret, isNew } = await api.hardware.claimDevice(deviceId, name);
      pushLog(isNew
        ? `✅ Totem enregistré avec un secret unique.`
        : `♻️ Totem déjà connu – secret inchangé.`
      );

      // 2. Envoi de la config complète via USB Serial
      const payload = {
        cmd: 'provision',
        ssid,
        password,
        host: serverHost,
        port: Number(serverPort) || 5174,
        deviceId,
        secret,
      };

      pushLog('📤 Envoi de la configuration au totem via USB…');
      await writerRef.current.write(JSON.stringify(payload) + '\n');

      pushLog('✅ Configuration envoyée ! Le totem va redémarrer et se connecter.');
      pushLog(`   → Nom         : ${name}`);
      pushLog(`   → Réseau WiFi : ${ssid}`);
      pushLog(`   → Serveur     : ${serverHost}:${serverPort}`);
      pushLog(`   → Device ID   : ${deviceId}`);
      setStep('done');
    } catch (err: any) {
      pushLog(`❌ Échec : ${err?.message ?? err}`);
      setStep('error');
    }
  }

  /* ── Déconnexion ── */
  async function disconnect() {
    try {
      readerRef.current?.cancel();
      writerRef.current?.close();
      await portRef.current?.close();
    } catch { /* ignore */ }
    portRef.current = null;
    writerRef.current = null;
    readerRef.current = null;
    setStep('idle');
    setSerialOutput([]);
    pushLog('🔌 Déconnecté.');
  }

  /* ─────────────────────────── rendu ─────────────────────────── */
  const isConnected = step === 'connected' || step === 'sending' || step === 'done';
  const canSend = step === 'connected';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate('/admin/hardware')}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Retour"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold">Provisioning USB – Totem ESP32</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Configurez le WiFi et le serveur directement depuis le navigateur
          </p>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Panneau gauche : formulaire ── */}
        <div className="space-y-5">

          {/* Bloc connexion */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
              Connexion USB
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Branchez le totem en USB, puis cliquez sur "Connecter". Une fenêtre vous demandera de choisir le port série.
            </p>
            {!isConnected ? (
              <button
                onClick={connectSerial}
                disabled={loadingConfig}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Connecter le totem
              </button>
            ) : (
              <button
                onClick={disconnect}
                className="w-full py-3 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-semibold transition-colors"
              >
                Déconnecter
              </button>
            )}
          </div>

          {/* Bloc config */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
            <h2 className="font-semibold text-lg">Configuration</h2>

            {/* Nom du totem */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Nom du totem
              </label>
              <input
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Scène gauche, Table 3…"
              />
              <p className="text-xs text-gray-400 mt-1">Nom affiché dans l'inventaire</p>
            </div>

            {/* Device ID */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Identifiant unique (deviceId)
              </label>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  placeholder="TOTEM-ABC12"
                />
                <button
                  onClick={() => setDeviceId(generateDeviceId())}
                  title="Régénérer"
                  className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
                >
                  ↻
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Identifiant permanent gravé dans le totem</p>
            </div>

            {/* WiFi SSID */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Réseau WiFi (SSID) <span className="text-red-500">*</span>
              </label>
              <input
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
                placeholder="MonReseau_5G"
                autoComplete="off"
              />
              <p className="text-xs text-gray-400 mt-1">
                Même réseau que le serveur BlindTest
              </p>
            </div>

            {/* WiFi Password */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Mot de passe WiFi
              </label>
              <div className="relative">
                <input
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPass ? 'text' : 'password'}
                  placeholder="Laisser vide si réseau ouvert"
                  autoComplete="off"
                />
                <button
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Serveur */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">
                  Adresse IP / hostname du serveur
                </label>
                <input
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={serverHost}
                  onChange={(e) => setServerHost(e.target.value)}
                  placeholder="192.168.1.10"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Port</label>
                <input
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={serverPort}
                  onChange={(e) => setServerPort(e.target.value)}
                  placeholder="5174"
                />
              </div>
            </div>

            {/* Info secret auto */}
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-start gap-3">
              <svg className="w-5 h-5 text-green-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <div>
                <p className="text-sm font-medium">Secret généré automatiquement</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Un secret unique et chiffré sera créé par le serveur et envoyé au totem. Vous n'avez rien à saisir.
                </p>
              </div>
            </div>

            {/* Bouton envoyer */}
            <button
              onClick={sendConfig}
              disabled={!canSend}
              className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {step === 'sending' ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Envoi en cours…
                </>
              ) : step === 'done' ? (
                '✅ Configuration envoyée !'
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Envoyer la configuration
                </>
              )}
            </button>

            {step === 'done' && (
              <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 text-sm text-green-700 dark:text-green-300">
                Le totem a reçu sa configuration et va redémarrer automatiquement. Après quelques secondes il doit apparaître dans l'inventaire si le WiFi est correct.
              </div>
            )}
          </div>
        </div>

        {/* ── Panneau droit : logs & sortie série ── */}
        <div className="space-y-5">

          {/* Sortie série */}
          <div className="bg-gray-950 rounded-2xl border border-gray-800 p-4 h-64 overflow-y-auto">
            <p className="text-xs text-gray-500 mb-2 font-mono uppercase tracking-wider">Sortie série du totem</p>
            {serialOutput.length === 0 ? (
              <p className="text-gray-600 text-xs font-mono">En attente de données…</p>
            ) : (
              serialOutput.map((line, i) => (
                <p key={i} className="text-green-400 text-xs font-mono leading-relaxed">{line}</p>
              ))
            )}
            <div ref={serialEndRef} />
          </div>

          {/* Log actions */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 h-64 overflow-y-auto">
            <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">Journal</p>
            {log.length === 0 ? (
              <p className="text-gray-400 text-sm">Aucune action.</p>
            ) : (
              log.map((entry, i) => (
                <p key={i} className="text-sm font-mono leading-relaxed text-gray-700 dark:text-gray-300">{entry}</p>
              ))
            )}
            <div ref={logEndRef} />
          </div>

          {/* Aide */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-5 space-y-3">
            <h3 className="font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Comment ça marche ?
            </h3>
            <ol className="space-y-2 text-sm text-blue-700 dark:text-blue-300 list-decimal list-inside">
              <li>Branchez le totem en USB sur cet ordinateur</li>
              <li>Cliquez <strong>Connecter le totem</strong> et sélectionnez le port série</li>
              <li>Renseignez le nom et mot de passe du WiFi local</li>
              <li>Cliquez <strong>Envoyer la configuration</strong></li>
              <li>Le totem se remet à zéro et se connecte automatiquement</li>
            </ol>
            <p className="text-xs text-blue-500 dark:text-blue-400 pt-1">
              ⚠️ Fonctionne uniquement dans Chrome ou Edge (Web Serial API).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
