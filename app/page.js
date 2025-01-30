"use client"
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const WS_PORT = 8080;

function useWindowSize() {
  const [screenSize, setScreenSize] = useState({
    width: 0,
    height: 0
  });

  useEffect(() => {
    function handleResize() {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    }

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return screenSize;
}

export default function Home() {
  const [timeLeft, setTimeLeft] = useState(600);
  const [isRunning, setIsRunning] = useState(false);
  const [isWarning, setIsWarning] = useState(false);
  const [showWarningMessage, setShowWarningMessage] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [showSwitchingMessage, setShowSwitchingMessage] = useState(false);
  const screenSize = useWindowSize();
  const audioRef = useRef(null);
  const hasPlayedBeep = useRef(false);
  const warningTimeoutRef = useRef(null);
  const wsRef = useRef(null);
  const lastUpdateTimeRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // Initialize WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      const ws = new WebSocket(`ws://${window.location.hostname}:${WS_PORT}`);
      
      ws.onopen = () => {
        console.log('WebSocket Connected');
        setWsConnected(true);
        ws.send(JSON.stringify({ type: 'REQUEST_SYNC' }));
      };

      ws.onclose = () => {
        console.log('WebSocket Disconnected');
        setWsConnected(false);
        setTimeout(connectWebSocket, 5000);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'TIMER_UPDATE':
            setTimeLeft(data.payload.timeLeft);
            setIsRunning(data.payload.isRunning);
            setShowSwitchingMessage(data.payload.timeLeft === 0);
            lastUpdateTimeRef.current = Date.now();
            break;
          case 'REQUEST_SYNC':
            if (timeLeft !== 600) {
              ws.send(JSON.stringify({
                type: 'SYNC_RESPONSE',
                payload: {
                  timeLeft,
                  isRunning,
                  lastUpdateTime: lastUpdateTimeRef.current
                }
              }));
            }
            break;
          case 'SYNC_RESPONSE':
            if (!lastUpdateTimeRef.current) {
              const { timeLeft: syncedTime, isRunning: syncedIsRunning, lastUpdateTime } = data.payload;
              const currentTime = Date.now();
              const timeElapsed = Math.floor((currentTime - lastUpdateTime) / 1000);
              const newTimeLeft = Math.max(0, syncedTime - (syncedIsRunning ? timeElapsed : 0));
              setTimeLeft(newTimeLeft);
              setIsRunning(syncedIsRunning && newTimeLeft > 0);
              setShowSwitchingMessage(newTimeLeft === 0);
              lastUpdateTimeRef.current = currentTime;
            }
            break;
        }
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Initialize audio context
  useEffect(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
      
      audioRef.current = {
        context: audioContext,
        oscillator,
        gainNode,
        playBeep: () => {
          if (!isMuted) {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.frequency.setValueAtTime(440, audioContext.currentTime);
            gain.gain.setValueAtTime(0, audioContext.currentTime);
            gain.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.1);
            gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.5);
            osc.start();
            osc.stop(audioContext.currentTime + 0.5);
          }
        }
      };

      return () => {
        gainNode.disconnect();
      };
    }
  }, [isMuted]);

  // Timer countdown
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }

      const startTime = Date.now();
      const initialTimeLeft = timeLeft;

      timerIntervalRef.current = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        const newTimeLeft = Math.max(0, initialTimeLeft - elapsedSeconds);
        
        setTimeLeft(newTimeLeft);
        setShowSwitchingMessage(newTimeLeft === 0);

        if (newTimeLeft === 0) {
          clearInterval(timerIntervalRef.current);
          setIsRunning(false);
        }

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'TIMER_UPDATE',
            payload: {
              timeLeft: newTimeLeft,
              isRunning: newTimeLeft > 0
            }
          }));
        }
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [isRunning]);

  // Warning handling - Modified for 30 seconds and quick disappearance
  useEffect(() => {
    if (timeLeft === 30) {
      setIsWarning(true);
      setShowWarningMessage(true);
      if (!hasPlayedBeep.current && audioRef.current) {
        audioRef.current.playBeep();
        hasPlayedBeep.current = true;
      }
      warningTimeoutRef.current = setTimeout(() => {
        setShowWarningMessage(false);
      }, 500); // Reduced to 500ms for quicker disappearance
    } else if (timeLeft === 0) {
      setIsWarning(false);
      setShowWarningMessage(false);
      setIsRunning(false);
      hasPlayedBeep.current = false;
    }
    
    return () => {
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, [timeLeft]);

  const getTimerSize = () => {
    if (screenSize.width === 0 || screenSize.height === 0) {
      return 400;
    }
    const size = Math.min(screenSize.width * 0.8, screenSize.height * 0.6);
    return Math.min(size, 500);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timerSize = getTimerSize();

  const resetTimer = () => {
    setTimeLeft(600);
    setIsRunning(false);
    setIsWarning(false);
    setShowWarningMessage(false);
    setShowSwitchingMessage(false);
    hasPlayedBeep.current = false;
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'TIMER_UPDATE',
        payload: {
          timeLeft: 600,
          isRunning: false
        }
      }));
    }
  };

  const toggleTimer = () => {
    if (timeLeft === 0) {
      resetTimer();
    }
    const newIsRunning = !isRunning;
    setIsRunning(newIsRunning);
    setShowSwitchingMessage(false);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'TIMER_UPDATE',
        payload: {
          timeLeft,
          isRunning: newIsRunning
        }
      }));
    }
  };

  return (
    <>
      <style jsx global>{`
        body {
          margin: 0;
          padding: 0;
          font-family: 'Space Mono', monospace;
          background: rgb(17, 24, 39);
          overflow: hidden;
          width: 100vw;
          height: 100vh;
        }
      `}</style>

      <main className="w-screen h-screen flex flex-col items-center justify-between p-4 bg-gray-900 text-white">
        <div className="fixed top-4 right-4 flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <span className="text-sm text-gray-400">
            {wsConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="pt-4 text-center"
        >
          <h1 className="text-4xl md:text-6xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
            Sketch & Switch
          </h1>
          <p className="text-xl md:text-2xl text-gray-400">Time to create your masterpiece!</p>
        </motion.div>

        <motion.div 
          className="relative flex-1 flex items-center justify-center"
          animate={{
            scale: isWarning ? [1, 1.05, 1] : 1,
          }}
          transition={{
            duration: 0.5,
            repeat: isWarning ? Infinity : 0,
          }}
        >
          <div 
            className="relative bg-gray-900 rounded-full flex items-center justify-center" 
            style={{ 
              width: `${timerSize}px`, 
              height: `${timerSize}px` 
            }}
          >
            <motion.div 
              className="text-4xl sm:text-6xl md:text-8xl font-bold text-center"
              animate={{
                color: isWarning ? ['#ffffff', '#ff0000'] : '#ffffff',
              }}
              transition={{
                duration: 0.5,
                repeat: isWarning ? Infinity : 0,
                repeatType: "reverse"
              }}
            >
              {showSwitchingMessage ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-3xl sm:text-5xl md:text-6xl text-yellow-400"
                >
                  Switching<br/>Teammate!
                </motion.div>
              ) : (
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
              )}
            </motion.div>
          </div>
        </motion.div>

        <div className="w-full max-w-2xl flex justify-center gap-4 md:gap-8 p-4">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleTimer}
            className={`px-4 md:px-8 py-3 md:py-4 rounded-lg text-lg md:text-xl font-bold transition ${
              isRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            {isRunning ? 'PAUSE' : 'START'}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={resetTimer}
            className="px-4 md:px-8 py-3 md:py-4 rounded-lg bg-blue-500 hover:bg-blue-600 text-lg md:text-xl font-bold"
          >
            RESET
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsMuted(!isMuted)}
            className="px-4 md:px-8 py-3 md:py-4 rounded-lg bg-gray-500 hover:bg-gray-600 text-lg md:text-xl font-bold"
          >
            {isMuted ? 'UNMUTE' : 'MUTE'}
          </motion.button>
        </div>

        <AnimatePresence>
          {showWarningMessage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 flex items-center justify-center bg-red-500 bg-opacity-90 z-50"
            >
              <div className="text-4xl md:text-6xl font-bold text-white text-center p-8">
                30 SECONDS REMAINING!
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </>
  );
}