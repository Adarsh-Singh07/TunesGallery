"use client";

import { memo, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { type Quote, getRandomQuote } from "../data/quotes";

interface Props {
  quote: Quote | null;
  songId: string;
}

const QuoteDisplay = memo(function QuoteDisplay({ quote: initialQuote, songId }: Props) {
  const [currentQuote, setCurrentQuote] = useState<Quote | null>(initialQuote);
  
  // Sync when song changes
  useEffect(() => {
    setCurrentQuote(initialQuote);
  }, [initialQuote, songId]);

  const handleNextQuote = () => {
    let nextQuote = getRandomQuote();
    // try to get a different quote
    if (currentQuote && nextQuote.text === currentQuote.text) {
      nextQuote = getRandomQuote();
    }
    setCurrentQuote(nextQuote);
  };

  if (!currentQuote) return null;

  return (
    <div 
      className="quote-container" 
      aria-label="Literary quote"
      onClick={handleNextQuote}
      title="Click for another quote"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuote.text}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="quote-inner"
        >
          <p className="quote-text">"{currentQuote.text}"</p>
          <p className="quote-attribution">
            <span className="quote-dash">—</span>
            <span className="quote-author">{currentQuote.author}</span>
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

export default QuoteDisplay;
