// Literary quotes for the UI
export interface Quote {
  text: string;
  author: string;
}

export const QUOTES: Quote[] = [
  { text: "We are all in the gutter, but some of us are looking at the stars.", author: "Oscar Wilde" },
  { text: "To love someone means to see them as God intended them.", author: "Fyodor Dostoevsky" },
  { text: "Anyone who loves in the expectation of being loved in return is wasting their time.", author: "Paulo Coelho" },
  { text: "I am entirely yours, that is if I am anything at all.", author: "Franz Kafka" },
  { text: "What we have once enjoyed we can never lose. All that we love deeply becomes a part of us.", author: "Helen Keller" },
  { text: "There is always some madness in love. But there is also always some reason in madness.", author: "Friedrich Nietzsche" },
  { text: "I have a million things to talk to you about. All I want in this world is you. I want to see you and talk.", author: "Haruki Murakami" },
  { text: "Pain and suffering are always inevitable for a large intelligence and a deep heart.", author: "Fyodor Dostoevsky" },
  { text: "You are my heart, my life, my one and only thought.", author: "Arthur Conan Doyle" },
  { text: "If you remember me, then I do not care if everyone else forgets.", author: "Haruki Murakami" },
  { text: "There are no happy endings. Endings are the saddest part, so just give me a happy middle and a very happy start.", author: "Shel Silverstein" },
  { text: "A book must be the axe for the frozen sea within us.", author: "Franz Kafka" },
  { text: "It is a joy to be hidden, and disaster not to be found.", author: "D.W. Winnicott" },
  { text: "Memories warm you up from the inside. But they also tear you apart.", author: "Haruki Murakami" },
  { text: "Love is a mystery that transforms everything it touches.", author: "Rumi" },
  { text: "The darker the night, the brighter the stars, the deeper the grief, the closer is God!", author: "Fyodor Dostoevsky" },
  { text: "I loved her against reason, against promise, against peace, against hope.", author: "Charles Dickens" },
  { text: "They say when you are missing someone that they are probably feeling the same, but I do not think it is possible for you to miss me as much as I am missing you right now.", author: "Edna St. Vincent Millay" },
  { text: "In dreams, we enter a world that is entirely our own.", author: "J.K. Rowling" },
  { text: "I exist in two places, here and where you are.", author: "Margaret Atwood" },
  { text: "Everything I have never done, I want to do with you.", author: "F. Scott Fitzgerald" },
  { text: "You have a place in my heart no one else ever could have.", author: "F. Scott Fitzgerald" },
  { text: "I love you as certain dark things are to be loved, in secret, between the shadow and the soul.", author: "Pablo Neruda" },
  { text: "We loved with a love that was more than love.", author: "Edgar Allan Poe" },
  { text: "Doubt thou the stars are fire; Doubt that the sun doth move; Doubt truth to be a liar; But never doubt I love.", author: "William Shakespeare" },
  { text: "Whatever our souls are made of, his and mine are the same.", author: "Emily Brontë" },
  { text: "The very essence of romance is uncertainty.", author: "Oscar Wilde" },
  { text: "I wish I had done everything on earth with you.", author: "F. Scott Fitzgerald" },
  { text: "I loved her against reason, against promise, against peace, against hope, against happiness, against all discouragement that could be.", author: "Charles Dickens" },
  { text: "Every heart sings a song, incomplete, until another heart whispers back.", author: "Plato" }
];

export function getQuoteForSong(songId: string, themeId?: string): Quote {
  let hash = 0;
  for (let i = 0; i < songId.length; i++) {
    hash = songId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % QUOTES.length;
  return QUOTES[idx];
}

export function getRandomQuote(): Quote {
  const idx = Math.floor(Math.random() * QUOTES.length);
  return QUOTES[idx];
}
