import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  Mic, 
  MicOff, 
  Settings, 
  Zap, 
  Activity, 
  Volume2, 
  Waves, 
  Skull, 
  Radio, 
  Power, 
  RefreshCw, 
  Circle, 
  Square, 
  Download, 
  Speaker, 
  Save, 
  Upload, 
  ShieldAlert,
  Trash2,
  X,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

interface AudioParams {
  gain: number;
  distortion: number;
  bitcrush: number;
  wobbleSpeed: number;
  wobbleDepth: number;
  filterCutoff: number;
  filterResonance: number;
  gateThreshold: number;
}

interface Preset {
  name: string;
  description: string;
  params: AudioParams;
}

const DEFAULT_PRESETS: Preset[] = [
  {
    name: "Pure Clean",
    description: "Direct signal with zero processing. Perfect for clean DI tracking.",
    params: { gain: 1.0, distortion: 0.0, bitcrush: 0.0, wobbleSpeed: 0.1, wobbleDepth: 0.0, filterCutoff: 15000, filterResonance: 0, gateThreshold: -50 }
  },
  {
    name: "Warm Crunch",
    description: "Classic tube-style breakup. Subtle saturation without the digital grit.",
    params: { gain: 1.1, distortion: 0.25, bitcrush: 0.0, wobbleSpeed: 0.1, wobbleDepth: 0.0, filterCutoff: 5000, filterResonance: 2, gateThreshold: -50 }
  },
  {
    name: "Vintage Overdrive",
    description: "Mid-forward overdrive for bluesy leads and rock rhythms.",
    params: { gain: 1.2, distortion: 0.45, bitcrush: 0.0, wobbleSpeed: 0.1, wobbleDepth: 0.0, filterCutoff: 3500, filterResonance: 5, gateThreshold: -50 }
  },
  {
    name: "Scary Monsters Growl",
    description: "Deep, aggressive vowel-like growl with heavy resonance and slow modulation.",
    params: { gain: 1.2, distortion: 0.85, bitcrush: 0.15, wobbleSpeed: 2.5, wobbleDepth: 0.8, filterCutoff: 800, filterResonance: 25, gateThreshold: -50 }
  },
  {
    name: "Bangarang Laser",
    description: "High-frequency digital lead with fast modulation and heavy bit-reduction.",
    params: { gain: 1.0, distortion: 0.6, bitcrush: 0.7, wobbleSpeed: 12.0, wobbleDepth: 0.4, filterCutoff: 3500, filterResonance: 15, gateThreshold: -50 }
  },
  {
    name: "Cinema Ethereal",
    description: "Soft, atmospheric pad with subtle movement and low-pass warmth.",
    params: { gain: 0.8, distortion: 0.2, bitcrush: 0.05, wobbleSpeed: 0.5, wobbleDepth: 0.2, filterCutoff: 1200, filterResonance: 5, gateThreshold: -50 }
  },
  {
    name: "Equinox Scream",
    description: "Piercing high-resonance scream with intense distortion and rapid wobble.",
    params: { gain: 1.5, distortion: 0.95, bitcrush: 0.4, wobbleSpeed: 8.0, wobbleDepth: 0.9, filterCutoff: 5000, filterResonance: 28, gateThreshold: -50 }
  },
  {
    name: "Kyoto Digital",
    description: "Clean digital pluck with high bitcrush and minimal modulation.",
    params: { gain: 1.1, distortion: 0.4, bitcrush: 0.85, wobbleSpeed: 1.0, wobbleDepth: 0.1, filterCutoff: 2000, filterResonance: 12, gateThreshold: -50 }
  },
  {
    name: "Recess Dub",
    description: "Classic dubstep wobble with heavy low-end focus and syncopated modulation.",
    params: { gain: 1.3, distortion: 0.7, bitcrush: 0.3, wobbleSpeed: 5.5, wobbleDepth: 0.75, filterCutoff: 600, filterResonance: 20, gateThreshold: -50 }
  },
  {
    name: "Summit Lead",
    description: "Bright, airy synth lead with high cutoff and very slow, subtle drift.",
    params: { gain: 0.9, distortion: 0.3, bitcrush: 0.1, wobbleSpeed: 0.2, wobbleDepth: 0.05, filterCutoff: 8000, filterResonance: 8, gateThreshold: -50 }
  }
];

// --- Audio Engine Hook ---

const useAudioEngine = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Nodes
  const inputGainRef = useRef<GainNode | null>(null);
  const gateRef = useRef<DynamicsCompressorNode | null>(null);
  const distortionRef = useRef<WaveShaperNode | null>(null);
  const bitcrushRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gateGainRef = useRef<GainNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [isActive, setIsActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isBypassed, setIsBypassed] = useState(false);
  const [latencyMode, setLatencyMode] = useState<'stable' | 'turbo'>('stable');
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>('default');
  const [selectedOutputId, setSelectedOutputId] = useState<string>('default');
  const [params, setParams] = useState<AudioParams>({
    gain: 1.0,
    distortion: 0.5,
    bitcrush: 0.2,
    wobbleSpeed: 4.0,
    wobbleDepth: 0.5,
    filterCutoff: 1000,
    filterResonance: 10,
    gateThreshold: -50,
  });

  const [error, setError] = useState<string | null>(null);

  // Fetch devices
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        setInputDevices(allDevices.filter(d => d.kind === 'audioinput'));
        setOutputDevices(allDevices.filter(d => d.kind === 'audiooutput'));
      } catch (err) {
        console.error("Error fetching devices:", err);
      }
    };
    fetchDevices();
    navigator.mediaDevices.addEventListener('devicechange', fetchDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', fetchDevices);
  }, []);

  // Handle output device change
  useEffect(() => {
    if (isActive && audioContextRef.current && (audioContextRef.current as any).setSinkId) {
      (audioContextRef.current as any).setSinkId(selectedOutputId)
        .catch((err: any) => console.error("Error setting output device:", err));
    }
  }, [selectedOutputId, isActive]);

  // Distortion curve
  const makeDistortionCurve = (amount: number) => {
    if (amount <= 0) return null;
    const k = amount * 100;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  };

  const start = async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          latencyHint: 'interactive',
        });
      }
      
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          deviceId: selectedInputId !== 'default' ? { exact: selectedInputId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        } 
      });
      streamRef.current = stream;

      sourceRef.current = ctx.createMediaStreamSource(stream);
      
      // Input Chain
      inputGainRef.current = ctx.createGain();
      gateGainRef.current = ctx.createGain();
      distortionRef.current = ctx.createWaveShaper();
      filterRef.current = ctx.createBiquadFilter();
      outputGainRef.current = ctx.createGain();
      analyserRef.current = ctx.createAnalyser();

      // Noise Gate Logic (using ScriptProcessor for level detection)
      const gateProcessor = ctx.createScriptProcessor(2048, 1, 1);
      let lastGateState = 1;
      gateProcessor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);
        const db = 20 * Math.log10(rms || 0.00001);
        
        const targetGate = db > params.gateThreshold ? 1 : 0;
        // Smooth transition
        lastGateState = lastGateState * 0.9 + targetGate * 0.1;
        
        if (gateGainRef.current) {
          gateGainRef.current.gain.setValueAtTime(lastGateState, ctx.currentTime);
        }
        
        // Pass through for processor chain
        e.outputBuffer.getChannelData(0).set(input);
      };

      // Bitcrusher with dynamic buffer size for latency control
      const bufferSize = latencyMode === 'turbo' ? 512 : 2048;
      const bitcrusher = ctx.createScriptProcessor(bufferSize, 1, 1);
      let phaser = 0;
      bitcrusher.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const output = e.outputBuffer.getChannelData(0);
        
        if (params.bitcrush <= 0 || isBypassed) {
          output.set(input);
          return;
        }

        const bits = 1 + (1 - params.bitcrush) * 15; // 1 to 16 bits
        const norm = Math.pow(2, bits);
        const step = Math.pow(0.5, bits);
        
        for (let i = 0; i < bufferSize; i++) {
          // Bit reduction
          output[i] = step * Math.floor(input[i] * norm);
        }
      };
      bitcrushRef.current = bitcrusher;

      // LFO for Wobble
      lfoRef.current = ctx.createOscillator();
      lfoGainRef.current = ctx.createGain();
      lfoRef.current.type = 'sine';
      lfoRef.current.frequency.setValueAtTime(params.wobbleSpeed, ctx.currentTime);
      lfoGainRef.current.gain.setValueAtTime(params.wobbleDepth * 1000, ctx.currentTime);
      
      lfoRef.current.connect(lfoGainRef.current);
      lfoGainRef.current.connect(filterRef.current.frequency);
      lfoRef.current.start();

      // Connections
      sourceRef.current.connect(inputGainRef.current);
      inputGainRef.current.connect(gateGainRef.current);
      inputGainRef.current.connect(gateProcessor); // Monitor level
      gateProcessor.connect(ctx.destination); // Required for processor to run
      
      gateGainRef.current.connect(distortionRef.current);
      distortionRef.current.connect(bitcrusher);
      bitcrusher.connect(filterRef.current);
      filterRef.current.connect(outputGainRef.current);
      outputGainRef.current.connect(analyserRef.current);
      outputGainRef.current.connect(ctx.destination);

      // Setup Recording Destination
      const dest = ctx.createMediaStreamDestination();
      outputGainRef.current.connect(dest);
      recorderRef.current = new MediaRecorder(dest.stream);
      
      recorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        chunksRef.current = [];
      };

      // Initial settings
      distortionRef.current.curve = makeDistortionCurve(params.distortion);
      filterRef.current.type = 'lowpass';
      filterRef.current.frequency.value = params.filterCutoff;
      filterRef.current.Q.value = params.filterResonance;
      
      setIsActive(true);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not access microphone. Please check permissions.");
    }
  };

  const stop = () => {
    if (isRecording) stopRecording();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (lfoRef.current) {
      lfoRef.current.stop();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsActive(false);
  };

  const startRecording = () => {
    if (!recorderRef.current || isRecording) return;
    chunksRef.current = [];
    recorderRef.current.start();
    setIsRecording(true);
    setRecordedUrl(null);
  };

  const stopRecording = () => {
    if (!recorderRef.current || !isRecording) return;
    recorderRef.current.stop();
    setIsRecording(false);
  };

  const resync = async () => {
    if (!isActive) return;
    stop();
    await new Promise(resolve => setTimeout(resolve, 100));
    await start();
  };

  // Handle input device change
  useEffect(() => {
    if (isActive) {
      resync();
    }
  }, [selectedInputId]);

  useEffect(() => {
    if (!isActive) return;
    const ctx = audioContextRef.current!;
    
    if (inputGainRef.current) inputGainRef.current.gain.setTargetAtTime(params.gain, ctx.currentTime, 0.01);
    
    if (distortionRef.current) {
      distortionRef.current.curve = isBypassed ? null : makeDistortionCurve(params.distortion);
    }
    
    if (filterRef.current) {
      const cutoff = isBypassed ? 20000 : params.filterCutoff;
      const resonance = isBypassed ? 0 : params.filterResonance;
      filterRef.current.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.01);
      filterRef.current.Q.setTargetAtTime(resonance, ctx.currentTime, 0.01);
    }
    
    if (lfoRef.current) {
      lfoRef.current.frequency.setTargetAtTime(params.wobbleSpeed, ctx.currentTime, 0.01);
    }
    
    if (lfoGainRef.current) {
      const depth = isBypassed ? 0 : params.wobbleDepth;
      lfoGainRef.current.gain.setTargetAtTime(depth * 2000, ctx.currentTime, 0.01);
    }
  }, [params, isActive, isBypassed]);

  return { 
    start, 
    stop, 
    isActive, 
    params, 
    setParams, 
    analyserRef, 
    error,
    isRecording,
    startRecording,
    stopRecording,
    recordedUrl,
    inputDevices,
    outputDevices,
    selectedInputId,
    setSelectedInputId,
    selectedOutputId,
    setSelectedOutputId,
    isBypassed,
    setIsBypassed,
    latencyMode,
    setLatencyMode,
    resync
  };
};

// --- UI Components ---

const Knob = ({ label, value, min, max, onChange, step = 0.01, unit = "" }: { 
  label: string; 
  value: number; 
  min: number; 
  max: number; 
  onChange: (val: number) => void;
  step?: number;
  unit?: string;
}) => {
  return (
    <div className="flex flex-col items-center gap-2 p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono">{label}</span>
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={step} 
        value={value} 
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-24 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
      />
      <span className="text-xs font-mono text-zinc-300">{value.toFixed(2)}{unit}</span>
    </div>
  );
};

const Visualizer = ({ analyser }: { analyser: AnalyserNode | null }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#f97316';
      ctx.beginPath();

      const sliceWidth = canvas.width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();
  }, [analyser]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-32 bg-zinc-950 rounded-lg border border-zinc-800 shadow-inner"
      width={600}
      height={128}
    />
  );
};

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
          <h3 className="text-lg font-bold uppercase tracking-tight text-zinc-200">{title}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </motion.div>
    </div>
  );
};

const PresetSelector = ({ presets, setPresets, currentParams, activePresetName, onSelect }: { 
  presets: Preset[]; 
  setPresets: React.Dispatch<React.SetStateAction<Preset[]>>;
  currentParams: AudioParams; 
  activePresetName: string | null;
  onSelect: (preset: Preset) => void 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState("");
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetDescription, setNewPresetDescription] = useState("");

  const saveCurrentPreset = () => {
    if (!newPresetName.trim()) return;
    
    const exists = presets.some(p => p.name.toLowerCase() === newPresetName.trim().toLowerCase());
    if (exists) {
      setAlertMessage(`A preset named "${newPresetName}" already exists.`);
      setIsAlertModalOpen(true);
      return;
    }

    const newPreset: Preset = {
      name: newPresetName.trim(),
      description: newPresetDescription.trim() || "User defined preset.",
      params: { ...currentParams }
    };

    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    localStorage.setItem('synthguitar-presets', JSON.stringify(updatedPresets));

    const data = JSON.stringify(newPreset, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${newPresetName.trim().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    setIsSaveModalOpen(false);
    setNewPresetName("");
    setNewPresetDescription("");
  };

  const loadPreset = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const loadedPreset = JSON.parse(event.target?.result as string);
        if (!loadedPreset.name || !loadedPreset.params) throw new Error("Invalid format");
        
        const exists = presets.some(p => p.name.toLowerCase() === loadedPreset.name.toLowerCase());
        if (exists) {
          setAlertMessage(`A preset named "${loadedPreset.name}" is already in your library.`);
          setIsAlertModalOpen(true);
          return;
        }

        const updatedPresets = [...presets, loadedPreset];
        setPresets(updatedPresets);
        localStorage.setItem('synthguitar-presets', JSON.stringify(updatedPresets));
        onSelect(loadedPreset.params);
      } catch (err) {
        console.error("Failed to parse preset file:", err);
        setAlertMessage("Invalid preset file format.");
        setIsAlertModalOpen(true);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmDeletePreset = () => {
    if (!presetToDelete) return;
    const updatedPresets = presets.filter(p => p.name !== presetToDelete);
    setPresets(updatedPresets);
    localStorage.setItem('synthguitar-presets', JSON.stringify(updatedPresets));
    setIsDeleteModalOpen(false);
    setPresetToDelete(null);
  };

  const handleDeleteClick = (name: string) => {
    setPresetToDelete(name);
    setIsDeleteModalOpen(true);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-zinc-400">
          <Settings size={16} />
          <span className="text-[10px] font-mono uppercase tracking-widest">Neural Presets</span>
        </div>
        <div className="flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={loadPreset} 
            accept=".json" 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-zinc-400 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-700 hover:text-zinc-200 transition-all"
          >
            <Upload size={12} />
            Load
          </button>
          <button 
            onClick={() => setIsSaveModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-zinc-400 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-700 hover:text-zinc-200 transition-all"
          >
            <Save size={12} />
            Save
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {presets.map((preset) => {
          const isActive = preset.name === activePresetName;
          return (
            <div key={preset.name} className="relative group">
              <button
                onClick={() => onSelect(preset)}
                className={`
                  w-full text-left p-4 rounded-xl border transition-all duration-200
                  ${isActive 
                    ? 'bg-orange-500/10 border-orange-500/50' 
                    : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'}
                `}
              >
                <div className="flex items-center justify-between mb-1 pr-6">
                  <span className={`text-xs font-bold uppercase tracking-tight ${isActive ? 'text-orange-500' : 'text-zinc-200'}`}>
                    {preset.name}
                  </span>
                  {isActive && <div className="w-1.5 h-1.5 bg-orange-500 rounded-full shadow-[0_0_8px_rgba(249,115,22,0.8)]" />}
                </div>
                <p className="text-[10px] text-zinc-500 leading-tight group-hover:text-zinc-400 transition-colors">
                  {preset.description}
                </p>
              </button>
              
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick(preset.name);
                }}
                className="absolute top-3 right-3 p-1.5 text-zinc-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                title="Delete Preset"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Save Modal */}
      <Modal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} title="Save Preset">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono">Preset Name</label>
            <input 
              type="text" 
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="Enter name..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm font-mono text-zinc-200 focus:outline-none focus:border-orange-500"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono">Description (Optional)</label>
            <textarea 
              value={newPresetDescription}
              onChange={(e) => setNewPresetDescription(e.target.value)}
              placeholder="Enter description..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm font-mono text-zinc-200 focus:outline-none focus:border-orange-500 min-h-[80px] resize-none"
            />
          </div>
          <button 
            onClick={saveCurrentPreset}
            className="w-full py-3 bg-orange-500 text-zinc-950 rounded-lg font-bold uppercase tracking-widest text-xs hover:bg-orange-400 transition-all"
          >
            Confirm Save
          </button>
        </div>
      </Modal>

      {/* Alert Modal */}
      <Modal isOpen={isAlertModalOpen} onClose={() => setIsAlertModalOpen(false)} title="Notification">
        <div className="flex flex-col items-center text-center space-y-4">
          <AlertCircle size={48} className="text-orange-500" />
          <p className="text-sm text-zinc-300 font-mono">{alertMessage}</p>
          <button 
            onClick={() => setIsAlertModalOpen(false)}
            className="w-full py-3 bg-zinc-800 text-zinc-200 rounded-lg font-bold uppercase tracking-widest text-xs hover:bg-zinc-700 transition-all"
          >
            Dismiss
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Deletion">
        <div className="flex flex-col items-center text-center space-y-4">
          <ShieldAlert size={48} className="text-red-500" />
          <p className="text-sm text-zinc-300 font-mono">
            Are you sure you want to delete the preset <span className="text-white font-bold">"{presetToDelete}"</span>? This action cannot be undone.
          </p>
          <div className="flex gap-3 w-full">
            <button 
              onClick={() => setIsDeleteModalOpen(false)}
              className="flex-1 py-3 bg-zinc-800 text-zinc-200 rounded-lg font-bold uppercase tracking-widest text-xs hover:bg-zinc-700 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={confirmDeletePreset}
              className="flex-1 py-3 bg-red-500 text-white rounded-lg font-bold uppercase tracking-widest text-xs hover:bg-red-600 transition-all"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
};

// --- Main App ---

export default function App() {
  const [presets, setPresets] = useState<Preset[]>(() => {
    const saved = localStorage.getItem('synthguitar-presets');
    return saved ? JSON.parse(saved) : DEFAULT_PRESETS;
  });

  const [activePresetName, setActivePresetName] = useState<string | null>(null);

  const { 
    start, 
    stop, 
    isActive, 
    params, 
    setParams, 
    analyserRef, 
    error,
    isRecording,
    startRecording,
    stopRecording,
    recordedUrl,
    inputDevices,
    outputDevices,
    selectedInputId,
    setSelectedInputId,
    selectedOutputId,
    setSelectedOutputId,
    isBypassed,
    setIsBypassed,
    latencyMode,
    setLatencyMode,
    resync
  } = useAudioEngine();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 font-sans selection:bg-orange-500/30">
      <div className="w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
        
        {/* Header */}
        <header className="p-8 border-bottom border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-zinc-900/50 backdrop-blur-sm">
          <div>
            <h1 className="flex items-center gap-4">
              <Zap className="text-orange-500 fill-orange-500" size={48} />
              <div className="flex flex-col leading-[0.85] font-black tracking-tighter uppercase italic text-4xl">
                <span><span className="text-orange-500">S</span>ynth</span>
                <span><span className="text-orange-500">Z</span>one</span>
              </div>
            </h1>
            <p className="text-xs font-mono text-zinc-500 mt-1 uppercase tracking-widest">
              High-Gain Neural Synth Processor // v1.0.4
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            {/* Input Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-1">
                <Mic size={10} /> Input Device
              </label>
              <select 
                value={selectedInputId}
                onChange={(e) => setSelectedInputId(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-xs font-mono px-3 py-2 rounded-lg text-zinc-300 focus:outline-none focus:border-orange-500"
              >
                <option value="default">Default Input</option>
                {inputDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Input ${device.deviceId.slice(0, 5)}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Output Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-1">
                <Speaker size={10} /> Output Device
              </label>
              <select 
                value={selectedOutputId}
                onChange={(e) => setSelectedOutputId(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-xs font-mono px-3 py-2 rounded-lg text-zinc-300 focus:outline-none focus:border-orange-500"
              >
                <option value="default">Default Speaker</option>
                {outputDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Output ${device.deviceId.slice(0, 5)}`}
                  </option>
                ))}
              </select>
            </div>

            <button 
              onClick={isActive ? stop : start}
              className={`
                relative group flex items-center gap-3 px-8 py-4 rounded-full font-bold transition-all duration-300
                ${isActive 
                  ? 'bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500/20' 
                  : 'bg-orange-500 text-zinc-950 hover:bg-orange-400 hover:scale-105 active:scale-95'}
              `}
            >
              {isActive ? <Power size={20} /> : <Zap size={20} />}
              <span className="uppercase tracking-widest text-sm">
                {isActive ? 'Deactivate' : 'Initialize Engine'}
              </span>
              {isActive && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
              )}
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="p-8 space-y-8">
          
          {/* Preset Selector */}
          <PresetSelector 
            presets={presets}
            setPresets={setPresets}
            currentParams={params} 
            activePresetName={activePresetName}
            onSelect={(preset) => {
              setParams(preset.params);
              setActivePresetName(preset.name);
            }} 
          />

          {/* Recording & Latency Controls */}
          <section className="flex flex-wrap items-center justify-between gap-4 p-4 bg-zinc-950 rounded-2xl border border-zinc-800">
            <div className="flex items-center gap-3">
              <button 
                disabled={!isActive}
                onClick={() => setIsBypassed(!isBypassed)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-all
                  ${!isActive ? 'opacity-30 cursor-not-allowed' : ''}
                  ${isBypassed 
                    ? 'bg-zinc-100 text-zinc-950' 
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}
                `}
              >
                <Waves size={14} className={isBypassed ? 'opacity-30' : 'text-orange-500'} />
                {isBypassed ? 'FX Bypassed' : 'FX Active'}
              </button>

              <div className="h-6 w-[1px] bg-zinc-800 hidden md:block" />

              <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                <button
                  onClick={() => setLatencyMode('stable')}
                  className={`px-3 py-1 text-[9px] font-bold uppercase tracking-tighter rounded transition-all ${latencyMode === 'stable' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Stable
                </button>
                <button
                  onClick={() => setLatencyMode('turbo')}
                  className={`px-3 py-1 text-[9px] font-bold uppercase tracking-tighter rounded transition-all ${latencyMode === 'turbo' ? 'bg-orange-500 text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Turbo
                </button>
              </div>

              <button
                disabled={!isActive}
                onClick={resync}
                className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-400 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-700 hover:text-zinc-200 transition-all disabled:opacity-30"
                title="Restarts audio context to fix drift/delay"
              >
                <RefreshCw size={12} className={isActive ? 'animate-spin-slow' : ''} />
                Resync
              </button>
            </div>

            <div className="flex items-center gap-4">
              <button
                disabled={!isActive}
                onClick={isRecording ? stopRecording : startRecording}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-all
                  ${!isActive ? 'opacity-30 cursor-not-allowed' : ''}
                  ${isRecording 
                    ? 'bg-red-500 text-white animate-pulse' 
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}
                `}
              >
                {isRecording ? <Square size={14} fill="white" /> : <Circle size={14} fill="currentColor" />}
                {isRecording ? 'Stop Recording' : 'Start Recording'}
              </button>

              {isRecording && (
                <div className="flex items-center gap-2 text-red-500 font-mono text-[10px] uppercase tracking-widest">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                  Recording Live Signal...
                </div>
              )}
            </div>

            {recordedUrl && (
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Recording Ready:</span>
                <a 
                  href={recordedUrl} 
                  download="synthguitar-session.wav"
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-zinc-950 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-orange-400 transition-all"
                >
                  <Download size={14} />
                  Export WAV
                </a>
              </div>
            )}
          </section>

          {/* Visualizer Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2 text-zinc-400">
                <Activity size={16} />
                <span className="text-[10px] font-mono uppercase tracking-widest">Signal Monitor</span>
              </div>
              {isActive && (
                <div className="flex items-center gap-2 text-orange-500">
                  <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-mono uppercase tracking-widest">Live Stream</span>
                </div>
              )}
            </div>
            <Visualizer analyser={analyserRef.current} />
          </section>

          {/* Controls Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Knob 
              label="Input Gain" 
              value={params.gain} 
              min={0} max={2} 
              onChange={(v) => {
                setParams(p => ({ ...p, gain: v }));
                setActivePresetName(null);
              }} 
            />
            <Knob 
              label="Distortion" 
              value={params.distortion} 
              min={0} max={1} 
              onChange={(v) => {
                setParams(p => ({ ...p, distortion: v }));
                setActivePresetName(null);
              }} 
            />
            <Knob 
              label="Bitcrush" 
              value={params.bitcrush} 
              min={0} max={1} 
              onChange={(v) => {
                setParams(p => ({ ...p, bitcrush: v }));
                setActivePresetName(null);
              }} 
            />
            <Knob 
              label="Wobble Speed" 
              value={params.wobbleSpeed} 
              min={0.1} max={20} 
              onChange={(v) => {
                setParams(p => ({ ...p, wobbleSpeed: v }));
                setActivePresetName(null);
              }} 
              unit="Hz"
            />
            <Knob 
              label="Wobble Depth" 
              value={params.wobbleDepth} 
              min={0} max={1} 
              onChange={(v) => {
                setParams(p => ({ ...p, wobbleDepth: v }));
                setActivePresetName(null);
              }} 
            />
            <Knob 
              label="Filter Cutoff" 
              value={params.filterCutoff} 
              min={100} max={10000} 
              onChange={(v) => {
                setParams(p => ({ ...p, filterCutoff: v }));
                setActivePresetName(null);
              }} 
              unit="Hz"
              step={10}
            />
            <Knob 
              label="Resonance" 
              value={params.filterResonance} 
              min={0} max={30} 
              onChange={(v) => {
                setParams(p => ({ ...p, filterResonance: v }));
                setActivePresetName(null);
              }} 
            />
            <Knob 
              label="Noise Gate" 
              value={params.gateThreshold} 
              min={-100} max={0} 
              onChange={(v) => {
                setParams(p => ({ ...p, gateThreshold: v }));
                setActivePresetName(null);
              }} 
              unit="dB"
              step={1}
            />
            <div className="flex flex-col items-center justify-center p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
               <Skull className="text-zinc-700 mb-2" size={24} />
               <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono">Status</span>
               <span className={`text-xs font-mono mt-1 ${isActive ? 'text-green-500' : 'text-zinc-600'}`}>
                 {isActive ? 'READY' : 'OFFLINE'}
               </span>
            </div>
          </div>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-500 text-sm font-mono flex items-center gap-3"
              >
                <MicOff size={18} />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

        </main>

        {/* Footer */}
        <footer className="p-6 bg-zinc-950 border-t border-zinc-800 flex justify-between items-center">
          <div className="flex gap-6">
            <div className="flex flex-col">
              <span className="text-[9px] text-zinc-600 uppercase font-bold tracking-tighter">Latency</span>
              <span className="text-xs font-mono text-zinc-400">Low (WebAudio)</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-zinc-600 uppercase font-bold tracking-tighter">Engine</span>
              <span className="text-xs font-mono text-zinc-400">Non-Exclusive I/O</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-zinc-600">
            <Radio size={14} />
            <span className="text-[10px] font-mono uppercase tracking-widest">Signal Processed Locally</span>
          </div>
        </footer>
      </div>

      {/* Instructions */}
      <div className="mt-8 max-w-2xl text-center space-y-4">
        <p className="text-zinc-500 text-sm leading-relaxed">
          Connect your guitar to your PC's line-in or microphone port. 
          Click <span className="text-orange-500 font-bold">Initialize Engine</span> to start processing. 
          Use the <span className="text-zinc-300 font-bold">Wobble</span> and <span className="text-zinc-300 font-bold">Bitcrush</span> controls to achieve Skrillex-style synth textures.
        </p>
        <div className="flex justify-center gap-4">
          <span className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded text-[10px] font-mono text-zinc-500 uppercase">No ASIO Required</span>
          <span className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded text-[10px] font-mono text-zinc-500 uppercase">Zero-Install</span>
          <span className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded text-[10px] font-mono text-zinc-500 uppercase">Browser Native</span>
        </div>
      </div>
    </div>
  );
}
