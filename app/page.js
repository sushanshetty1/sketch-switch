"use client"
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusCircle } from 'lucide-react';
import CompletionMessage from '@/components/CompletionMessage';

const WS_PORT = 8080;
const TOTAL_ROUNDS = 9;
const ROUND_TIME = 600;
const SYNC_INTERVAL = 5000;

function useWindowSize() {
  const [screenSize, setScreenSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0
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
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
  const [isRunning, setIsRunning] = useState(false);
  const [isWarning, setIsWarning] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showWarningMessage, setShowWarningMessage] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [showSwitchingMessage, setShowSwitchingMessage] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [showCompletionMessage, setShowCompletionMessage] = useState(false);
  const [stateVersion, setStateVersion] = useState(0);
  const screenSize = useWindowSize();
  const audioRef = useRef(null);
  const wsRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const serverTimeOffsetRef = useRef(0);
  const lastStateUpdateRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  const getServerTime = () => Date.now() + serverTimeOffsetRef.current;

  const calculateTimeLeft = (startTime, duration) => {
    const currentServerTime = getServerTime();
    const elapsed = Math.floor((currentServerTime - startTime) / 1000);
    return Math.max(0, duration - elapsed);
  };

  const handleStateUpdate = (newState, fromSync = false) => {
    console.log('Received state update:', newState);
    
    if (!lastStateUpdateRef.current || newState.stateVersion > lastStateUpdateRef.current.stateVersion) {
      lastStateUpdateRef.current = newState;
      
      const newOffset = newState.serverTime - Date.now();
      serverTimeOffsetRef.current = newOffset;

      setTimeLeft(newState.timeLeft);
      setIsRunning(newState.isRunning);
      setCurrentRound(newState.currentRound);
      setStateVersion(newState.stateVersion);
      
      if (newState.timeLeft === 0) {
        if (newState.currentRound === TOTAL_ROUNDS) {
          setShowCompletionMessage(true);
          setShowSwitchingMessage(false);
        } else {
          setShowSwitchingMessage(true);
          setShowCompletionMessage(false);
        }
      } else {
        setShowSwitchingMessage(false);
        setShowCompletionMessage(false);
      }
      
      setShowMenu(false);
    }
  };

  useEffect(() => {
    const connectWebSocket = () => {
      const ws = new WebSocket(`ws://${window.location.hostname}:${WS_PORT}`);
      
      ws.onopen = () => {
        console.log('WebSocket Connected');
        setWsConnected(true);
        // Request initial sync
        ws.send(JSON.stringify({ 
          type: 'REQUEST_SYNC',
          payload: { stateVersion }
        }));
      };
  
      ws.onmessage = (event) => {
        console.log('WebSocket message received:', event.data); // Debug log
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'STATE_UPDATE':
            handleStateUpdate(data.payload);
            break;
  
          case 'SYNC_RESPONSE':
            handleStateUpdate(data.payload, true);
            break;
  
          case 'TIME_SYNC':
            serverTimeOffsetRef.current = data.payload.serverTime - Date.now();
            break;
        }
      };
  
      ws.onclose = () => {
        console.log('WebSocket Disconnected');
        setWsConnected(false);
        // Clear any existing sync timeout
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
        }
        // Attempt to reconnect
        setTimeout(connectWebSocket, 5000);
      };
  
      wsRef.current = ws;
  
      // Set up periodic sync
      const scheduleSyncRequest = () => {
        syncTimeoutRef.current = setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'REQUEST_SYNC',
              payload: { stateVersion }
            }));
          }
          scheduleSyncRequest();
        }, SYNC_INTERVAL);
      };
  
      scheduleSyncRequest();
  
      return () => {
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
        }
      };
    };
  
    connectWebSocket();
  
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      // Clear any existing interval
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }

      const startTime = getServerTime();
      const initialTimeLeft = timeLeft;

      timerIntervalRef.current = setInterval(() => {
        const newTimeLeft = calculateTimeLeft(startTime, initialTimeLeft);
        
        // Update local state
        setTimeLeft(newTimeLeft);

        // Warning logic
        if (newTimeLeft === 30) {
          setShowWarningMessage(true);
          setIsWarning(true);
          audioRef.current?.playBeep();
          setTimeout(() => setShowWarningMessage(false), 3000);
        }

        setIsWarning(newTimeLeft <= 30);

        // Handle timer completion
        if (newTimeLeft === 0) {
          clearInterval(timerIntervalRef.current);
          setIsRunning(false);
          setIsWarning(false);
          setShowMenu(false);
          
          if (currentRound === TOTAL_ROUNDS) {
            setShowCompletionMessage(true);
          } else {
            setShowSwitchingMessage(true);
          }
        }

        // Broadcast state update
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'STATE_UPDATE',
            payload: {
              timeLeft: newTimeLeft,
              isRunning: newTimeLeft > 0,
              currentRound,
              stateVersion: stateVersion + 1,
              serverTime: getServerTime()
            }
          }));
        }
      }, 1000);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [isRunning, currentRound, stateVersion]);

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

  const getTimerSize = () => {
    if (screenSize.width === 0 || screenSize.height === 0) {
      return 400;
    }
    const size = Math.min(screenSize.width * 0.8, screenSize.height * 0.7);
    return Math.min(size, 600);
  };

  const resetTimer = () => {
    const newState = {
      timeLeft: ROUND_TIME,
      isRunning: false,
      currentRound,
      stateVersion: stateVersion + 1,
      serverTime: getServerTime()
    };

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'STATE_UPDATE',
        payload: newState
      }));
    }

    handleStateUpdate(newState);
    setIsWarning(false);
    setShowWarningMessage(false);
    setShowSwitchingMessage(false);
    setShowMenu(false);
  };

  const completeReset = () => {
    const newState = {
      timeLeft: ROUND_TIME,
      isRunning: false,
      currentRound: 1,
      stateVersion: stateVersion + 1,
      serverTime: getServerTime()
    };

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'STATE_UPDATE',
        payload: newState
      }));
    }

    handleStateUpdate(newState);
    setIsWarning(false);
    setShowWarningMessage(false);
    setShowSwitchingMessage(false);
    setShowCompletionMessage(false);
    setShowMenu(false);
  };

  const handleStartClick = () => {
    const newState = {
      timeLeft: showSwitchingMessage ? ROUND_TIME : timeLeft,
      isRunning: !isRunning, // Toggle the running state
      currentRound: showSwitchingMessage ? currentRound + 1 : currentRound,
      stateVersion: stateVersion + 1,
      serverTime: getServerTime()
    };
  
    console.log('Sending state update:', newState);
  
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'STATE_UPDATE',
        payload: newState
      }));
    }
  
    handleStateUpdate(newState);
  };
  
  const toggleMenu = () => {
    setShowMenu(!showMenu);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timerSize = getTimerSize();

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
        <AnimatePresence>
        {showCompletionMessage ? (
            <CompletionMessage onReset={completeReset} />
          ) : (
            <>
              <div className="fixed top-4 right-4 flex items-center gap-4">
                <div className="text-xl font-bold text-gray-300">
                  Round {currentRound}/{TOTAL_ROUNDS}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span className="text-sm text-gray-400">
                    {wsConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
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
                  className="relative bg-gray-900 rounded-full flex items-center justify-center mt-3s" 
                  style={{ 
                    width: `${timerSize}px`, 
                    height: `${timerSize}px` 
                  }}
                >
                  <motion.div 
                    className="text-6xl sm:text-8xl md:text-9xl font-bold text-center"
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
                        className="text-4xl sm:text-6xl md:text-7xl text-yellow-400"
                      >
                        Switching<br/>Teammate!
                      </motion.div>
                    ) : (
                      `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
                    )}
                  </motion.div>
                </div>
              </motion.div>

              <div className="relative w-full max-w-2xl flex flex-col items-center gap-4">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleMenu}
                  className="p-2 rounded-full hover:bg-gray-800 transition-colors"
                >
                  <PlusCircle size={32} className="text-gray-400" />
                </motion.button>

                <AnimatePresence>
                  {showMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="absolute bottom-full mb-4 w-full flex justify-center gap-4 md:gap-8"
                    >
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleStartClick}
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
                        className="px-4 md:px-8 py-3 md:py-4 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-lg md:text-xl font-bold"
                      >
                        RESET TIMER
                      </motion.button>

                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={completeReset}
                        className="px-4 md:px-8 py-3 md:py-4 rounded-lg bg-purple-500 hover:bg-purple-600 text-lg md:text-xl font-bold"
                      >
                        FULL RESET
                      </motion.button>

                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsMuted(!isMuted)}
                        className="px-4 md:px-8 py-3 md:py-4 rounded-lg bg-gray-500 hover:bg-gray-600 text-lg md:text-xl font-bold"
                      >
                        {isMuted ? 'UNMUTE' : 'MUTE'}
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showWarningMessage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 flex items-center justify-center bg-red-500 z-50"
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