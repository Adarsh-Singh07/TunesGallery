"use client";

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Quote } from "../data/quotes";

interface Props {
  quote: Quote | null;
  songId: string;
}

const QuoteDisplay = memo(function QuoteDisplay({ quote, songId }: Props) {
  if (!quote) return null;

  return (
    <div className="quote-container" aria-label="Literary quote">
      <AnimatePresence mode="wait">
        <motion.div
          key={songId}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.15 }}
          className="quote-inner"
        >
          <p className="quote-text">{quote.text}</p>
          <p className="quote-attribution">
            <span className="quote-dash">—</span>
            <span className="quote-author">{quote.author}</span>
            {quote.source && (
              <span className="quote-source">, {quote.source}</span>
            )}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

export default QuoteDisplay;
