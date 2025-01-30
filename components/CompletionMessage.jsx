import React from 'react';
import { motion } from 'framer-motion';
import { Award, RotateCcw } from 'lucide-react';

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6 }
  }
};

const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2
    }
  }
};

export default function CompletionMessage({ onReset }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-gradient-to-b from-gray-900 to-black z-50"
    >
      {/* Reset Button - Fixed Position */}
      <motion.button
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onReset}
        className="fixed top-8 right-8 p-4 rounded-full bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors backdrop-blur-sm"
      >
        <RotateCcw className="w-6 h-6" />
      </motion.button>

      {/* Main Content */}
      <motion.div 
        variants={container}
        initial="hidden"
        animate="visible"
        className="h-full flex flex-col items-center justify-center max-w-4xl mx-auto px-6"
      >
        {/* Trophy Icon */}
        <motion.div
          variants={fadeInUp}
          className="mb-12"
        >
          <div className="relative">
            <Award className="w-24 h-24 text-yellow-400" />
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ 
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="absolute inset-0 bg-yellow-400/20 rounded-full"
            />
          </div>
        </motion.div>

        {/* Main Title */}
        <motion.h1
          variants={fadeInUp}
          className="text-6xl md:text-8xl font-bold mb-8 tracking-tight text-center"
        >
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-yellow-200 to-yellow-400">
            Competition Complete!
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.div
          variants={fadeInUp}
          className="space-y-6 text-center"
        >
          <p className="text-3xl md:text-4xl text-gray-300 font-light">
            Your artistic vision has been captured
          </p>
          <div className="space-y-2">
            <p className="text-xl md:text-2xl text-gray-400">
              Get ready for the showcase presentation
            </p>
            <p className="text-lg text-gray-500">
              Results will be announced during the showcase event
            </p>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}