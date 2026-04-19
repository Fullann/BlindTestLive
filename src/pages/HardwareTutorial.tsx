import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Cpu, Speaker, Zap } from 'lucide-react';

export default function HardwareTutorial() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 app-shell">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/admin/hardware')}
            className="bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour inventaire
          </button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-400" />
            Tuto montage buzzer ESP32
          </h1>
          <div className="text-xs text-zinc-500">Version V1</div>
        </div>

        <section className="bg-zinc-900 border border-white/10 rounded-2xl p-5 app-card">
          <h2 className="text-lg font-semibold mb-3">Pièces nécessaires</h2>
          <ul className="text-sm text-zinc-300 space-y-1 list-disc list-inside">
            <li>1x ESP32 DevKit</li>
            <li>1x bouton arcade (NO)</li>
            <li>1x LED verte + 1x LED rouge (ou LED RGB)</li>
            <li>1x haut-parleur piezo / buzzer passif</li>
            <li>Résistances 220 ohms (LED), fils Dupont, breadboard</li>
            <li>Alimentation USB 5V stable</li>
          </ul>
        </section>

        <section className="bg-zinc-900 border border-white/10 rounded-2xl p-5 app-card">
          <h2 className="text-lg font-semibold mb-3">Câblage conseillé</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="bg-zinc-950 border border-white/10 rounded-xl p-3">
              <p className="font-medium mb-1 flex items-center gap-2"><Cpu className="w-4 h-4 text-indigo-300" /> ESP32</p>
              <p className="text-zinc-400">Bouton: GPIO18 vers GND (INPUT_PULLUP)</p>
              <p className="text-zinc-400">LED verte: GPIO26 (avec 220 ohms)</p>
              <p className="text-zinc-400">LED rouge: GPIO27 (avec 220 ohms)</p>
              <p className="text-zinc-400">Speaker: GPIO25</p>
            </div>
            <div className="bg-zinc-950 border border-white/10 rounded-xl p-3">
              <p className="font-medium mb-1 flex items-center gap-2"><Zap className="w-4 h-4 text-amber-300" /> Alimentation</p>
              <p className="text-zinc-400">5V USB recommandé</p>
              <p className="text-zinc-400">Masse commune obligatoire</p>
              <p className="text-zinc-400">Eviter les câbles trop longs</p>
            </div>
          </div>
        </section>

        <section className="bg-zinc-900 border border-white/10 rounded-2xl p-5 app-card">
          <h2 className="text-lg font-semibold mb-3">Ajouter un buzzer dans l&apos;app</h2>
          <ol className="text-sm text-zinc-300 space-y-2 list-decimal list-inside">
            <li>Configurer `DEVICE_ID`, Wi-Fi, serveur et secret dans `docs/firmware-esp32.ino`.</li>
            <li>Flasher l&apos;ESP32 et démarrer le module.</li>
            <li>Lancer une partie depuis l&apos;admin.</li>
            <li>Ouvrir l&apos;inventaire matériel de la partie (`/admin/game/:gameId/hardware`).</li>
            <li>Assigner le `deviceId` à un joueur.</li>
            <li>Tester LED et audio (boutons de test).</li>
          </ol>
        </section>

        <section className="bg-zinc-900 border border-white/10 rounded-2xl p-5 app-card">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Speaker className="w-5 h-5 text-emerald-400" />
            Gestion haut-parleur
          </h2>
          <ul className="text-sm text-zinc-300 space-y-1 list-disc list-inside">
            <li><strong>Activer/Désactiver HP</strong> : coupe totalement la sortie audio du device.</li>
            <li><strong>Mute/Unmute</strong> : garde le HP actif mais coupe le son.</li>
            <li><strong>Tester HP</strong> : envoie un bip de validation à distance.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
