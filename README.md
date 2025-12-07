# HG-2 Saturation Plugin

A web-based audio saturation plugin inspired by the Black Box Analog Design HG-2, featuring real-time tube saturation processing, multiple tube types, and audio recording capabilities.

![Plugin Interface](https://img.shields.io/badge/Status-Production-green)
![Web Audio API](https://img.shields.io/badge/Web%20Audio%20API-Enabled-blue)

## Features

### 🎛️ Main Controls
- **Pentode & Triode Stages** - Series tube saturation with independent gain control
- **Parallel Saturation Circuit** - Additional 12AX7 tube path for aggressive harmonics
- **Tube Swapping** - Choose between multiple tube types (6U8A, 12AX7, 12AT7, ECC83)
- **Output Gain** - Master level control with automatic gain compensation

### 🎚️ Advanced Parameters
- **Density** - Drive both tube stages harder without changing balance
- **Air** - High-frequency enhancement above 10kHz for "sparkle"
- **Mix** - Dry/wet blend for parallel processing
- **Saturation Frequency** - Low/Flat/High frequency targeting for parallel circuit
- **Calibration** - Dark/Normal/Bright high-frequency voicing
- **Alt Tube** - Switch between standard and aggressive 12AX7 voicings

### 🎙️ Input/Output
- **Microphone Input** - Process audio from your mic in real-time
- **File Upload** - Load and process audio files (supports most formats)
- **Recording** - Capture your processed audio with start/stop controls
- **Export** - Download processed audio as .webm files

### 📊 Visual Feedback
- Real-time input/output level meters
- Color-coded metering (green → yellow → red)
- Visual knob position indicators
- Processing status display

## Quick Start

### Option 1: No Setup Required (Recommended for most users)
1. Download `saturation-plugin.html`
2. Double-click to open in your web browser
3. Click "MIC INPUT" or "LOAD FILE"
4. Start processing!

### Option 2: React Integration (For developers)
```jsx
import SaturationPlugin from './saturation-plugin.jsx';

function App() {
  return <SaturationPlugin />;
}
```

## How to Use

### Basic Workflow
1. **Load Audio**
   - Click "MIC INPUT" to use your microphone, or
   - Click "LOAD FILE" to upload an audio file

2. **Adjust Saturation**
   - Start with Pentode and Triode around 50%
   - Use Density to increase overall drive
   - Enable Saturation circuit for more aggressive tones

3. **Fine-tune the Sound**
   - Use Air to add high-frequency brightness
   - Adjust Mix to blend dry/wet signals
   - Try different tube combinations for varied tones

4. **Record & Export**
   - Click "START RECORDING" to capture your audio
   - Click "STOP RECORDING" when done
   - Click "DOWNLOAD AUDIO" to save the file

## Tube Types Explained

### Pentode Options
- **6U8A** - Classic pentode, aggressive with asymmetric clipping
- **12AX7** - High gain, very aggressive saturation
- **ECC83** - European variant, smoother but still punchy

### Triode Options
- **6U8A** - Classic triode, warm and smooth
- **12AT7** - Lower gain, very smooth and warm
- **ECC83** - Medium gain, balanced warmth with subtle modulation

### Saturation Circuit
- **Standard** - Classic 12AX7 tube overdrive
- **Aggressive** - More intense distortion character

## Technical Details

- Built with React 18 and Web Audio API
- 4x oversampling for reduced aliasing
- RMS-based metering for accurate level display
- Parallel dry/wet architecture
- MediaRecorder API for audio capture
- Zero-latency processing

## Browser Compatibility

✅ Chrome/Edge (Recommended)  
✅ Firefox  
✅ Safari  
⚠️ Requires modern browser with Web Audio API support

## Tips & Tricks

- **For Vocals**: Try Pentode at 40%, Triode at 60%, with Air around 30%
- **For Drums**: Use higher Pentode (70%+) with Saturation enabled
- **For Bass**: Lower Saturation Frequency to "LOW" and increase Density
- **For Mix Bus**: Keep settings subtle (Pentode/Triode around 30-40%)
- **Parallel Processing**: Use Mix at 30-50% to blend with dry signal

## License

MIT License - Feel free to use, modify, and distribute!

## Credits

Inspired by the Black Box Analog Design HG-2 hardware unit. This is a web-based emulation and is not affiliated with Black Box Analog Design.

## Support

Found a bug? Have a feature request? Open an issue on GitHub!

---

**Made with ❤️ using Web Audio API**
