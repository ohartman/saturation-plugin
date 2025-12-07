import React, { useState, useEffect, useRef } from 'react';
import { Upload, Mic, Square, Download, Circle } from 'lucide-react';

export default function SaturationPlugin() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [inputSource, setInputSource] = useState('mic'); // 'mic' or 'file'
  
  // Main tube controls
  const [pentode, setPentode] = useState(50);
  const [triode, setTriode] = useState(50);
  const [pentodeTubeType, setPentodeTubeType] = useState('6U8A'); // '6U8A', '12AX7', 'ECC83'
  const [triodeTubeType, setTriodeTubeType] = useState('6U8A'); // '6U8A', '12AT7', 'ECC83'
  
  // Parallel saturation circuit
  const [saturationEnabled, setSaturationEnabled] = useState(false);
  const [saturation, setSaturation] = useState(0);
  const [altTube, setAltTube] = useState(false);
  const [saturationFreq, setSaturationFreq] = useState('flat'); // 'low', 'flat', 'high'
  
  // Additional controls
  const [density, setDensity] = useState(50);
  const [air, setAir] = useState(0);
  const [mix, setMix] = useState(100);
  const [outputGain, setOutputGain] = useState(75);
  const [calibration, setCalibration] = useState('normal'); // 'dark', 'normal', 'bright'
  
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  
  // Series tube stages
  const pentodeWaveShaperRef = useRef(null);
  const triodeWaveShaperRef = useRef(null);
  
  // Parallel saturation
  const saturationWaveShaperRef = useRef(null);
  const saturationGainRef = useRef(null);
  const saturationFilterRef = useRef(null);
  
  // Main signal path
  const inputGainRef = useRef(null);
  const densityGainRef = useRef(null);
  const airFilterRef = useRef(null);
  const airGainRef = useRef(null);
  const dryGainRef = useRef(null);
  const wetGainRef = useRef(null);
  const outputGainNodeRef = useRef(null);
  
  const analyserInputRef = useRef(null);
  const analyserOutputRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);

  // Create pentode tube curve (more aggressive, odd harmonics)
  const createPentodeCurve = (amount, tubeType) => {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const gain = 1 + (amount / 100) * 4; // 1x to 5x gain
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      const driven = x * gain;
      
      switch(tubeType) {
        case '6U8A': // Classic pentode - aggressive, asymmetric
          curve[i] = (Math.tanh(driven * 1.5) + driven * 0.1) / 1.1;
          break;
        case '12AX7': // High gain, very aggressive
          curve[i] = Math.tanh(driven * 2.2) * 0.9 + driven * 0.05;
          break;
        case 'ECC83': // European variant - smoother but still aggressive
          curve[i] = Math.sign(driven) * Math.pow(Math.abs(Math.tanh(driven * 1.3)), 0.9);
          break;
        default:
          curve[i] = Math.tanh(driven);
      }
    }
    
    return curve;
  };

  // Create triode tube curve (warmer, even harmonics)
  const createTriodeCurve = (amount, tubeType) => {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const gain = 1 + (amount / 100) * 3; // 1x to 4x gain
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      const driven = x * gain;
      
      switch(tubeType) {
        case '6U8A': // Classic triode - warm and smooth
          curve[i] = Math.tanh(driven) * 0.95;
          break;
        case '12AT7': // Lower gain, very smooth and warm
          curve[i] = Math.tanh(driven * 0.8) * 0.98 + driven * 0.02;
          break;
        case 'ECC83': // Medium gain, balanced warmth
          curve[i] = (Math.tanh(driven * 1.1) + Math.sin(driven * 0.5) * 0.1) * 0.9;
          break;
        default:
          curve[i] = Math.tanh(driven);
      }
    }
    
    return curve;
  };

  // Create parallel saturation curve (12AX7 tubes - can be aggressive)
  const createSaturationCurve = (amount, isAlt) => {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const gain = 1 + (amount / 100) * 10; // Can get very driven
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      const driven = x * gain;
      
      if (isAlt) {
        // Alt tube: more aggressive distortion
        curve[i] = Math.sign(driven) * Math.pow(Math.abs(Math.tanh(driven * 2)), 0.7);
      } else {
        // Standard: classic tube overdrive
        curve[i] = Math.tanh(driven * 1.8) + driven * 0.05;
      }
    }
    
    return curve;
  };

  // Initialize audio context and nodes
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      
      // Input stage
      inputGainRef.current = audioContextRef.current.createGain();
      densityGainRef.current = audioContextRef.current.createGain();
      
      // Series tube stages (Pentode -> Triode)
      pentodeWaveShaperRef.current = audioContextRef.current.createWaveShaper();
      triodeWaveShaperRef.current = audioContextRef.current.createWaveShaper();
      pentodeWaveShaperRef.current.oversample = '4x';
      triodeWaveShaperRef.current.oversample = '4x';
      
      // Parallel saturation circuit
      saturationWaveShaperRef.current = audioContextRef.current.createWaveShaper();
      saturationWaveShaperRef.current.oversample = '4x';
      saturationGainRef.current = audioContextRef.current.createGain();
      saturationFilterRef.current = audioContextRef.current.createBiquadFilter();
      saturationFilterRef.current.type = 'allpass'; // Default to flat
      
      // Air circuit (high shelf above 10kHz)
      airFilterRef.current = audioContextRef.current.createBiquadFilter();
      airFilterRef.current.type = 'highshelf';
      airFilterRef.current.frequency.value = 10000;
      airGainRef.current = audioContextRef.current.createGain();
      
      // Mix and output
      dryGainRef.current = audioContextRef.current.createGain();
      wetGainRef.current = audioContextRef.current.createGain();
      outputGainNodeRef.current = audioContextRef.current.createGain();
      
      // Analysers
      analyserInputRef.current = audioContextRef.current.createAnalyser();
      analyserOutputRef.current = audioContextRef.current.createAnalyser();
      analyserInputRef.current.fftSize = 2048;
      analyserOutputRef.current.fftSize = 2048;
      
      // Set initial values
      updateAllParameters();
    }
  };

  // Update all audio parameters
  const updateAllParameters = () => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    
    const now = ctx.currentTime;
    
    // Update tube curves with selected tube types
    if (pentodeWaveShaperRef.current) {
      pentodeWaveShaperRef.current.curve = createPentodeCurve(pentode, pentodeTubeType);
    }
    if (triodeWaveShaperRef.current) {
      triodeWaveShaperRef.current.curve = createTriodeCurve(triode, triodeTubeType);
    }
    if (saturationWaveShaperRef.current) {
      saturationWaveShaperRef.current.curve = createSaturationCurve(saturation, altTube);
    }
    
    // Density affects overall tube gain
    if (densityGainRef.current) {
      const densityLevel = 0.5 + (density / 100) * 1.5; // 0.5x to 2x
      densityGainRef.current.gain.setValueAtTime(densityLevel, now);
    }
    
    // Saturation frequency select
    if (saturationFilterRef.current) {
      switch(saturationFreq) {
        case 'low':
          saturationFilterRef.current.type = 'lowpass';
          saturationFilterRef.current.frequency.value = 800;
          break;
        case 'high':
          saturationFilterRef.current.type = 'highpass';
          saturationFilterRef.current.frequency.value = 2000;
          break;
        default:
          saturationFilterRef.current.type = 'allpass';
      }
    }
    
    // Air control (high shelf boost)
    if (airFilterRef.current && airGainRef.current) {
      const airBoost = air / 100 * 8; // 0 to 8dB
      airFilterRef.current.gain.setValueAtTime(airBoost, now);
    }
    
    // Mix control (dry/wet blend)
    if (dryGainRef.current && wetGainRef.current) {
      const wetLevel = mix / 100;
      const dryLevel = 1 - wetLevel;
      dryGainRef.current.gain.setValueAtTime(dryLevel, now);
      wetGainRef.current.gain.setValueAtTime(wetLevel, now);
    }
    
    // Output gain
    if (outputGainNodeRef.current) {
      const gainLevel = outputGain / 100; // 0 to 1 linear
      outputGainNodeRef.current.gain.setValueAtTime(gainLevel, now);
    }
    
    // Saturation circuit gain
    if (saturationGainRef.current) {
      const satGain = saturationEnabled ? (saturation / 100) : 0;
      saturationGainRef.current.gain.setValueAtTime(satGain, now);
    }
  };

  // Start microphone input
  const startMicrophone = async () => {
    try {
      initAudioContext();
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(stream);
      connectAudioGraph();
      setIsProcessing(true);
      startMeters();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  // Handle file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      initAudioContext();
      
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      
      // Stop previous source if exists
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
        } catch (e) {
          // Source may already be stopped
        }
      }
      
      sourceNodeRef.current = audioContextRef.current.createBufferSource();
      sourceNodeRef.current.buffer = audioBuffer;
      sourceNodeRef.current.loop = true;
      
      connectAudioGraph();
      sourceNodeRef.current.start(0);
      setIsProcessing(true);
      startMeters();
    } catch (error) {
      console.error('Error loading audio file:', error);
      alert('Error loading audio file.');
    } finally {
      // Reset the input value so the same file can be selected again
      event.target.value = '';
    }
  };

  // Connect audio processing graph (Black Box HG-2 architecture)
  const connectAudioGraph = () => {
    if (!sourceNodeRef.current) return;
    
    // Input monitoring
    sourceNodeRef.current.connect(analyserInputRef.current);
    
    // Input gain and density control
    sourceNodeRef.current.connect(inputGainRef.current);
    inputGainRef.current.connect(densityGainRef.current);
    
    // DRY PATH (for mix control)
    sourceNodeRef.current.connect(dryGainRef.current);
    
    // MAIN SATURATED PATH (Series: Pentode -> Triode)
    densityGainRef.current.connect(pentodeWaveShaperRef.current);
    pentodeWaveShaperRef.current.connect(triodeWaveShaperRef.current);
    
    // PARALLEL SATURATION CIRCUIT (12AX7 tubes)
    densityGainRef.current.connect(saturationWaveShaperRef.current);
    saturationWaveShaperRef.current.connect(saturationFilterRef.current);
    saturationFilterRef.current.connect(saturationGainRef.current);
    
    // Combine series tubes + parallel saturation
    triodeWaveShaperRef.current.connect(airFilterRef.current);
    saturationGainRef.current.connect(airFilterRef.current);
    
    // Air circuit
    airFilterRef.current.connect(wetGainRef.current);
    
    // Mix wet and dry
    wetGainRef.current.connect(outputGainNodeRef.current);
    dryGainRef.current.connect(outputGainNodeRef.current);
    
    // Output monitoring and destination
    outputGainNodeRef.current.connect(analyserOutputRef.current);
    outputGainNodeRef.current.connect(audioContextRef.current.destination);
  };

  // Stop processing
  const stopProcessing = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (sourceNodeRef.current) {
      if (sourceNodeRef.current.stop) {
        sourceNodeRef.current.stop();
      }
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    stopRecording();
    
    setIsProcessing(false);
    setInputLevel(0);
    setOutputLevel(0);
  };

  // Start recording processed audio
  const startRecording = () => {
    if (!audioContextRef.current || !outputGainNodeRef.current) return;
    
    try {
      // Create a destination for recording
      const dest = audioContextRef.current.createMediaStreamDestination();
      outputGainNodeRef.current.connect(dest);
      
      // Set up MediaRecorder
      mediaRecorderRef.current = new MediaRecorder(dest.stream);
      recordedChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        setHasRecording(true);
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Could not start recording.');
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Download recorded audio
  const downloadRecording = () => {
    if (recordedChunksRef.current.length === 0) return;
    
    const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hg2-saturation-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Start level meters
  const startMeters = () => {
    const updateMeters = () => {
      if (analyserInputRef.current && analyserOutputRef.current) {
        const inputArray = new Uint8Array(analyserInputRef.current.frequencyBinCount);
        const outputArray = new Uint8Array(analyserOutputRef.current.frequencyBinCount);
        
        analyserInputRef.current.getByteTimeDomainData(inputArray);
        analyserOutputRef.current.getByteTimeDomainData(outputArray);
        
        // Calculate RMS level
        const inputRMS = Math.sqrt(inputArray.reduce((sum, val) => sum + Math.pow((val - 128) / 128, 2), 0) / inputArray.length);
        const outputRMS = Math.sqrt(outputArray.reduce((sum, val) => sum + Math.pow((val - 128) / 128, 2), 0) / outputArray.length);
        
        setInputLevel(Math.min(inputRMS * 100, 100));
        setOutputLevel(Math.min(outputRMS * 100, 100));
      }
      
      animationFrameRef.current = requestAnimationFrame(updateMeters);
    };
    
    updateMeters();
  };

  // Update effects when controls change
  useEffect(() => {
    updateAllParameters();
  }, [pentode, triode, pentodeTubeType, triodeTubeType, saturation, altTube, 
      saturationEnabled, saturationFreq, density, air, mix, outputGain, calibration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopProcessing();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-lg shadow-2xl p-8 w-full max-w-5xl border-4 border-zinc-700" style={{
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5), 0 10px 40px rgba(0,0,0,0.8)'
      }}>
        {/* Header */}
        <div className="text-center mb-6 pb-4 border-b border-zinc-700">
          <h1 className="text-5xl font-bold text-amber-400 mb-1" style={{
            textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 0 20px rgba(251,191,36,0.3)'
          }}>HG-2</h1>
          <p className="text-zinc-400 text-sm tracking-widest">BLACK BOX ANALOG DESIGN</p>
        </div>

        {/* Input Source Controls */}
        <div className="mb-6 flex gap-3 justify-center">
          <button
            onClick={() => {
              stopProcessing();
              setInputSource('mic');
              startMicrophone();
            }}
            disabled={isProcessing && inputSource === 'mic'}
            className={`flex items-center gap-2 px-5 py-2.5 rounded font-semibold text-sm transition-all border-2 ${
              isProcessing && inputSource === 'mic'
                ? 'bg-amber-600 text-white border-amber-500'
                : 'bg-zinc-800 text-zinc-300 border-zinc-600 hover:border-amber-500'
            }`}
          >
            <Mic size={18} />
            MIC INPUT
          </button>
          
          <label className={`flex items-center gap-2 px-5 py-2.5 rounded font-semibold text-sm cursor-pointer transition-all border-2 ${
            isProcessing && inputSource === 'file'
              ? 'bg-amber-600 text-white border-amber-500'
              : 'bg-zinc-800 text-zinc-300 border-zinc-600 hover:border-amber-500'
          }`}>
            <Upload size={18} />
            LOAD FILE
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => {
                stopProcessing();
                setInputSource('file');
                handleFileUpload(e);
              }}
              className="hidden"
            />
          </label>

          {isProcessing && (
            <button
              onClick={stopProcessing}
              className="flex items-center gap-2 px-5 py-2.5 rounded font-semibold text-sm bg-red-700 text-white border-2 border-red-600 hover:bg-red-800 transition-all"
            >
              <Square size={18} />
              BYPASS
            </button>
          )}
        </div>

        {/* Recording Controls */}
        {isProcessing && (
          <div className="mb-6 flex gap-3 justify-center">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="flex items-center gap-2 px-5 py-2.5 rounded font-semibold text-sm bg-red-600 text-white border-2 border-red-500 hover:bg-red-700 transition-all"
              >
                <Circle size={18} />
                START RECORDING
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 px-5 py-2.5 rounded font-semibold text-sm bg-red-700 text-white border-2 border-red-600 animate-pulse"
              >
                <Square size={18} />
                STOP RECORDING
              </button>
            )}
            
            {hasRecording && (
              <button
                onClick={downloadRecording}
                className="flex items-center gap-2 px-5 py-2.5 rounded font-semibold text-sm bg-green-600 text-white border-2 border-green-500 hover:bg-green-700 transition-all"
              >
                <Download size={18} />
                DOWNLOAD AUDIO
              </button>
            )}
          </div>
        )}

        {/* Level Meters */}
        <div className="mb-8 space-y-2 bg-zinc-800 rounded p-4 border-2 border-zinc-700">
          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1 font-mono">
              <span>INPUT</span>
              <span>{inputLevel.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-zinc-900 rounded overflow-hidden border border-zinc-700">
              <div
                className="h-full bg-gradient-to-r from-green-600 via-amber-500 to-red-600 transition-all duration-75"
                style={{ width: `${inputLevel}%` }}
              />
            </div>
          </div>
          
          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1 font-mono">
              <span>OUTPUT</span>
              <span>{outputLevel.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-zinc-900 rounded overflow-hidden border border-zinc-700">
              <div
                className="h-full bg-gradient-to-r from-green-600 via-amber-500 to-red-600 transition-all duration-75"
                style={{ width: `${outputLevel}%` }}
              />
            </div>
          </div>
        </div>

        {/* Main Controls Grid */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          {/* PENTODE */}
          <div className="flex flex-col items-center">
            <div className="relative mb-3">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center border-4 border-zinc-600 shadow-lg"
                   style={{boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.8), 0 4px 12px rgba(0,0,0,0.5)'}}>
                <div className="text-2xl font-bold text-amber-400">{pentode}</div>
              </div>
              <div className="absolute top-1 left-1/2 w-1 h-3 bg-amber-500 rounded" style={{
                transform: `rotate(${(pentode / 100) * 270 - 135}deg)`,
                transformOrigin: 'bottom center'
              }}></div>
            </div>
            <label className="text-amber-400 font-bold text-sm mb-2 tracking-wider">PENTODE</label>
            <input
              type="range"
              min="0"
              max="100"
              value={pentode}
              onChange={(e) => setPentode(parseInt(e.target.value))}
              className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer tube-slider mb-2"
            />
            <select
              value={pentodeTubeType}
              onChange={(e) => setPentodeTubeType(e.target.value)}
              className="w-full px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs text-amber-400 font-mono cursor-pointer hover:border-amber-500 transition-colors"
            >
              <option value="6U8A">6U8A</option>
              <option value="12AX7">12AX7</option>
              <option value="ECC83">ECC83</option>
            </select>
          </div>

          {/* TRIODE */}
          <div className="flex flex-col items-center">
            <div className="relative mb-3">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center border-4 border-zinc-600 shadow-lg"
                   style={{boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.8), 0 4px 12px rgba(0,0,0,0.5)'}}>
                <div className="text-2xl font-bold text-amber-400">{triode}</div>
              </div>
              <div className="absolute top-1 left-1/2 w-1 h-3 bg-amber-500 rounded" style={{
                transform: `rotate(${(triode / 100) * 270 - 135}deg)`,
                transformOrigin: 'bottom center'
              }}></div>
            </div>
            <label className="text-amber-400 font-bold text-sm mb-2 tracking-wider">TRIODE</label>
            <input
              type="range"
              min="0"
              max="100"
              value={triode}
              onChange={(e) => setTriode(parseInt(e.target.value))}
              className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer tube-slider mb-2"
            />
            <select
              value={triodeTubeType}
              onChange={(e) => setTriodeTubeType(e.target.value)}
              className="w-full px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs text-amber-400 font-mono cursor-pointer hover:border-amber-500 transition-colors"
            >
              <option value="6U8A">6U8A</option>
              <option value="12AT7">12AT7</option>
              <option value="ECC83">ECC83</option>
            </select>
          </div>

          {/* SATURATION */}
          <div className="flex flex-col items-center">
            <div className="relative mb-3">
              <div className={`w-24 h-24 rounded-full bg-gradient-to-br flex items-center justify-center border-4 shadow-lg transition-all ${
                saturationEnabled 
                  ? 'from-amber-700 to-amber-900 border-amber-500' 
                  : 'from-zinc-700 to-zinc-900 border-zinc-600'
              }`} style={{boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.8), 0 4px 12px rgba(0,0,0,0.5)'}}>
                <div className={`text-2xl font-bold ${saturationEnabled ? 'text-white' : 'text-zinc-500'}`}>{saturation}</div>
              </div>
              {saturationEnabled && (
                <div className="absolute top-1 left-1/2 w-1 h-3 bg-white rounded" style={{
                  transform: `rotate(${(saturation / 100) * 270 - 135}deg)`,
                  transformOrigin: 'bottom center'
                }}></div>
              )}
            </div>
            <label className="text-amber-400 font-bold text-sm mb-2 tracking-wider">SATURATION</label>
            <input
              type="range"
              min="0"
              max="100"
              value={saturation}
              onChange={(e) => setSaturation(parseInt(e.target.value))}
              disabled={!saturationEnabled}
              className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer tube-slider mb-2"
            />
            <button
              onClick={() => setSaturationEnabled(!saturationEnabled)}
              className={`w-full px-3 py-1 rounded text-xs font-bold transition-all border ${
                saturationEnabled 
                  ? 'bg-amber-600 text-white border-amber-500' 
                  : 'bg-zinc-700 text-zinc-400 border-zinc-600'
              }`}
            >
              {saturationEnabled ? 'ACTIVE' : 'BYPASS'}
            </button>
          </div>

          {/* OUTPUT */}
          <div className="flex flex-col items-center">
            <div className="relative mb-3">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center border-4 border-zinc-600 shadow-lg"
                   style={{boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.8), 0 4px 12px rgba(0,0,0,0.5)'}}>
                <div className="text-2xl font-bold text-amber-400">{outputGain}</div>
              </div>
              <div className="absolute top-1 left-1/2 w-1 h-3 bg-amber-500 rounded" style={{
                transform: `rotate(${(outputGain / 100) * 270 - 135}deg)`,
                transformOrigin: 'bottom center'
              }}></div>
            </div>
            <label className="text-amber-400 font-bold text-sm mb-2 tracking-wider">OUTPUT</label>
            <input
              type="range"
              min="0"
              max="100"
              value={outputGain}
              onChange={(e) => setOutputGain(parseInt(e.target.value))}
              className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer tube-slider"
            />
          </div>
        </div>

        {/* Secondary Controls */}
        <div className="grid grid-cols-3 gap-4 mb-6 bg-zinc-800 rounded p-4 border-2 border-zinc-700">
          {/* DENSITY */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-amber-400 font-bold text-xs tracking-wider">DENSITY</label>
              <span className="text-zinc-400 text-xs font-mono">{density}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={density}
              onChange={(e) => setDensity(parseInt(e.target.value))}
              className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer tube-slider"
            />
          </div>

          {/* AIR */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-amber-400 font-bold text-xs tracking-wider">AIR</label>
              <span className="text-zinc-400 text-xs font-mono">{air}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={air}
              onChange={(e) => setAir(parseInt(e.target.value))}
              className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer tube-slider"
            />
          </div>

          {/* MIX */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-amber-400 font-bold text-xs tracking-wider">MIX</label>
              <span className="text-zinc-400 text-xs font-mono">{mix}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={mix}
              onChange={(e) => setMix(parseInt(e.target.value))}
              className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer tube-slider"
            />
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="grid grid-cols-2 gap-4 bg-zinc-800 rounded p-4 border-2 border-zinc-700">
          {/* Saturation Frequency */}
          <div>
            <label className="text-amber-400 font-bold text-xs tracking-wider mb-2 block">SAT FREQ</label>
            <div className="flex gap-2">
              {['low', 'flat', 'high'].map((freq) => (
                <button
                  key={freq}
                  onClick={() => setSaturationFreq(freq)}
                  disabled={!saturationEnabled}
                  className={`flex-1 px-2 py-1 rounded text-xs font-bold transition-all border ${
                    saturationFreq === freq && saturationEnabled
                      ? 'bg-amber-600 text-white border-amber-500'
                      : 'bg-zinc-700 text-zinc-400 border-zinc-600'
                  }`}
                >
                  {freq.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Calibration */}
          <div>
            <label className="text-amber-400 font-bold text-xs tracking-wider mb-2 block">CALIBRATION</label>
            <div className="flex gap-2">
              {['dark', 'normal', 'bright'].map((cal) => (
                <button
                  key={cal}
                  onClick={() => setCalibration(cal)}
                  className={`flex-1 px-2 py-1 rounded text-xs font-bold transition-all border ${
                    calibration === cal
                      ? 'bg-amber-600 text-white border-amber-500'
                      : 'bg-zinc-700 text-zinc-400 border-zinc-600'
                  }`}
                >
                  {cal.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Alt Tube Toggle for Saturation Circuit */}
        <div className="mt-4 bg-zinc-800 rounded p-4 border-2 border-zinc-700">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-amber-400 font-bold text-xs tracking-wider block mb-1">SATURATION TUBE</label>
              <p className="text-zinc-500 text-xs">12AX7 Voicing</p>
            </div>
            <button
              onClick={() => setAltTube(!altTube)}
              disabled={!saturationEnabled}
              className={`px-6 py-2 rounded text-sm font-bold transition-all border-2 ${
                altTube && saturationEnabled
                  ? 'bg-amber-600 text-white border-amber-500'
                  : 'bg-zinc-700 text-zinc-400 border-zinc-600'
              }`}
            >
              {altTube ? 'AGGRESSIVE' : 'STANDARD'}
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="mt-6 text-center">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded border-2 ${
            isProcessing 
              ? 'bg-amber-600/20 text-amber-400 border-amber-600' 
              : 'bg-zinc-800 text-zinc-500 border-zinc-700'
          }`}>
            <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-amber-400 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="text-xs font-bold tracking-wider">
              {isProcessing ? 'PROCESSING' : 'STANDBY'}
            </span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .tube-slider::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
          cursor: pointer;
          box-shadow: 0 0 8px rgba(251, 191, 36, 0.6), inset 0 1px 2px rgba(255,255,255,0.3);
          border: 2px solid #78350f;
        }

        .tube-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
          cursor: pointer;
          border: 2px solid #78350f;
          box-shadow: 0 0 8px rgba(251, 191, 36, 0.6), inset 0 1px 2px rgba(255,255,255,0.3);
        }

        .tube-slider::-webkit-slider-thumb:hover {
          background: linear-gradient(135deg, #fcd34d, #fbbf24);
          box-shadow: 0 0 12px rgba(251, 191, 36, 0.8), inset 0 1px 2px rgba(255,255,255,0.3);
        }

        .tube-slider::-moz-range-thumb:hover {
          background: linear-gradient(135deg, #fcd34d, #fbbf24);
          box-shadow: 0 0 12px rgba(251, 191, 36, 0.8), inset 0 1px 2px rgba(255,255,255,0.3);
        }

        .tube-slider:disabled::-webkit-slider-thumb {
          background: #52525b;
          box-shadow: none;
        }

        .tube-slider:disabled::-moz-range-thumb {
          background: #52525b;
          box-shadow: none;
        }
      `}</style>
    </div>
  );
}
