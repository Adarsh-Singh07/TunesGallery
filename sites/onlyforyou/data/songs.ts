import type { PlaybackReference } from "../lib/playback/types";

export interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  year?: string;
  artwork: {
    cover: string;
  };
  playback: PlaybackReference;
  accent: string;
}

export const songs: Song[] = [
  {
    id: "01",
    title: "Raat Akeli Thi",
    artist: "Tips Official",
    album: "Merry Christmas",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/1yzDUrFVAcU/hqdefault.jpg"
    },
    playback: {
      youtubeId: "1yzDUrFVAcU"
    },
    accent: "#c4736a"
  },
  {
    id: "02",
    title: "'Mere Nishan' Full Audio Song by Darshan Raval",
    artist: "Outrageous tuber",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/GG2q368Mr9g/hqdefault.jpg"
    },
    playback: {
      youtubeId: "GG2q368Mr9g"
    },
    accent: "#c4736a"
  },
  {
    id: "03",
    title: "\"Suno Na Sangemarmar\" Full Song with Lyrics",
    artist: "T-Series",
    album: "Youngistaan",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/83pr5QLz6Bc/hqdefault.jpg"
    },
    playback: {
      youtubeId: "83pr5QLz6Bc"
    },
    accent: "#c4736a"
  },
  {
    id: "04",
    title: "Aaj Se Teri -",
    artist: "Zee Music Company",
    album: "Padman",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/NFsEqOBG51M/hqdefault.jpg"
    },
    playback: {
      youtubeId: "NFsEqOBG51M"
    },
    accent: "#c4736a"
  },
  {
    id: "05",
    title: "Zaalima -",
    artist: "Zee Music Company",
    album: "Raees",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/hhdSyBHuI88/hqdefault.jpg"
    },
    playback: {
      youtubeId: "hhdSyBHuI88"
    },
    accent: "#c4736a"
  },
  {
    id: "06",
    title: "Jogi -",
    artist: "Zee Music Company",
    album: "Shaadi Mein Zaroor Aana",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/HexFqifusOk/hqdefault.jpg"
    },
    playback: {
      youtubeId: "HexFqifusOk"
    },
    accent: "#c4736a"
  },
  {
    id: "07",
    title: "Tere Hawaale  Laal Singh Chaddha",
    artist: "T-Series",
    album: "Aamir,Kareena",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/KUpwupYj_tY/hqdefault.jpg"
    },
    playback: {
      youtubeId: "KUpwupYj_tY"
    },
    accent: "#c4736a"
  },
  {
    id: "08",
    title: "KAUN TUJHE",
    artist: "T-Series",
    album: "M.S. DHONI -THE UNTOLD STORY",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/Ov0YGGSY6gY/hqdefault.jpg"
    },
    playback: {
      youtubeId: "Ov0YGGSY6gY"
    },
    accent: "#c4736a"
  },
  {
    id: "09",
    title: "Naino Ne Baandhi -",
    artist: "Zee Music Company",
    album: "Gold",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/Y9ozt29tzgs/hqdefault.jpg"
    },
    playback: {
      youtubeId: "Y9ozt29tzgs"
    },
    accent: "#c4736a"
  },
  {
    id: "10",
    title: "Ik Mulaqaat - Dream Girl",
    artist: "Zee Music Company",
    album: "Ayushmann Khurrana, Nushrat Bharucha",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/zing4uQ3dR4/hqdefault.jpg"
    },
    playback: {
      youtubeId: "zing4uQ3dR4"
    },
    accent: "#c4736a"
  },
  {
    id: "11",
    title: "Tera Fitoor  - Genius",
    artist: "Tips Official",
    album: "Utkarsh Sharma, Ishita Chauhan",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/qfdShSZZxlg/hqdefault.jpg"
    },
    playback: {
      youtubeId: "qfdShSZZxlg"
    },
    accent: "#c4736a"
  },
  {
    id: "12",
    title: "Dil Jhoom",
    artist: "Zee Music Company",
    album: "Gadar 2",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/BsqrmY91nUQ/hqdefault.jpg"
    },
    playback: {
      youtubeId: "BsqrmY91nUQ"
    },
    accent: "#c4736a"
  },
  {
    id: "13",
    title: "Jaan Nisaar -",
    artist: "Zee Music Company",
    album: "Kedarnath",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/vdbP_3o73qI/hqdefault.jpg"
    },
    playback: {
      youtubeId: "vdbP_3o73qI"
    },
    accent: "#c4736a"
  },
  {
    id: "14",
    title: "Kalank Title Track -",
    artist: "Zee Music Company",
    album: "Alia Bhatt , Varun Dhawan",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/Grr0FlC8SQA/hqdefault.jpg"
    },
    playback: {
      youtubeId: "Grr0FlC8SQA"
    },
    accent: "#c4736a"
  },
  {
    id: "15",
    title: "Qaafirana",
    artist: "Zee Music Company",
    album: "Kedarnath",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/ZmcBC9-wAXM/hqdefault.jpg"
    },
    playback: {
      youtubeId: "ZmcBC9-wAXM"
    },
    accent: "#c4736a"
  },
  {
    id: "16",
    title: "Arijit Singh, Pritam",
    artist: "seventyskye",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/39ghSEArbf4/hqdefault.jpg"
    },
    playback: {
      youtubeId: "39ghSEArbf4"
    },
    accent: "#c4736a"
  },
  {
    id: "17",
    title: "dil sambhal ja zara song lyrics",
    artist: "Itz me Arabi",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/Xp7XWB_E6fA/hqdefault.jpg"
    },
    playback: {
      youtubeId: "Xp7XWB_E6fA"
    },
    accent: "#c4736a"
  },
  {
    id: "18",
    title: "Tu Jaane Na Full  - Ajab Prem Ki Ghazab Kahani",
    artist: "RAJAT LFS - TERMIRAIDER",
    album: "Ranbir Kapoor, Katrina",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/BewnzhHlQuk/hqdefault.jpg"
    },
    playback: {
      youtubeId: "BewnzhHlQuk"
    },
    accent: "#c4736a"
  },
  {
    id: "19",
    title: "Arijit Singh",
    artist: "7clouds Hindi",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/8sqDCkVgMbc/hqdefault.jpg"
    },
    playback: {
      youtubeId: "8sqDCkVgMbc"
    },
    accent: "#c4736a"
  },
  {
    id: "20",
    title: "LYRICS - Main Phir Bhi Tumko Chahunga",
    artist: "LyricalsVerse",
    album: "Arijit Singh, Shashaa Tirupati",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/Am3gIN7TgeQ/hqdefault.jpg"
    },
    playback: {
      youtubeId: "Am3gIN7TgeQ"
    },
    accent: "#c4736a"
  },
  {
    id: "21",
    title: "Tune Jo Na Kaha Song",
    artist: "Golden Trending Music \ud83c\udfb5",
    album: "New York",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/nUI4rDhiJr4/hqdefault.jpg"
    },
    playback: {
      youtubeId: "nUI4rDhiJr4"
    },
    accent: "#c4736a"
  },
  {
    id: "22",
    title: "Arijit Singh, Jeet Gannguli",
    artist: "seventyskye",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/LTBuUMsfb3s/hqdefault.jpg"
    },
    playback: {
      youtubeId: "LTBuUMsfb3s"
    },
    accent: "#c4736a"
  },
  {
    id: "23",
    title: "Javed Bashir - Ye Tune Kya Kiya  \ud83c\udfb6",
    artist: "Axjou India",
    album: "main dil ka raaz kehta hoon ki jab jab saanse leta hun\ud83d\udcad\ud83c\udfa4",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/EKcVql4rlss/hqdefault.jpg"
    },
    playback: {
      youtubeId: "EKcVql4rlss"
    },
    accent: "#c4736a"
  },
  {
    id: "24",
    title: "Arijit Singh, Palak Muchhal - Chahun Main Ya Naa",
    artist: "D-Muze India",
    album: "Aashiqui 2",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/Q4F7MF5Vzt0/hqdefault.jpg"
    },
    playback: {
      youtubeId: "Q4F7MF5Vzt0"
    },
    accent: "#c4736a"
  },
  {
    id: "25",
    title: "Agar Tum Saath Ho Full Audio Song IITamasha",
    artist: "Ramesh Mudhiraj ",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/5ER0txQD6Ws/hqdefault.jpg"
    },
    playback: {
      youtubeId: "5ER0txQD6Ws"
    },
    accent: "#c4736a"
  },
  {
    id: "26",
    title: "Arijit Singh",
    artist: "Geet Mantra",
    album: "Jeet Gannguli - Khamoshiyan (Lyrics)",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/LmnpgSc1tKo/hqdefault.jpg"
    },
    playback: {
      youtubeId: "LmnpgSc1tKo"
    },
    accent: "#c4736a"
  },
  {
    id: "27",
    title: "Rattan Lambiyan  song",
    artist: "Sukoon tapes",
    album: "shershaah",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/5_N2p7kJewA/hqdefault.jpg"
    },
    playback: {
      youtubeId: "5_N2p7kJewA"
    },
    accent: "#c4736a"
  },
  {
    id: "28",
    title: "Dil Ibaadat",
    artist: "Kay Kay - Topic",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/IgITZfS7L_8/hqdefault.jpg"
    },
    playback: {
      youtubeId: "IgITZfS7L_8"
    },
    accent: "#c4736a"
  },
  {
    id: "29",
    title: "Gehra hua - Dhurandar",
    artist: "Prikfonk",
    album: "Arijit Singh",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/lPxxhOUloUM/hqdefault.jpg"
    },
    playback: {
      youtubeId: "lPxxhOUloUM"
    },
    accent: "#c4736a"
  },
  {
    id: "30",
    title: "Snehil Bhoumik",
    artist: "Snehil Bhoumik",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/VVMRSec4x40/hqdefault.jpg"
    },
    playback: {
      youtubeId: "VVMRSec4x40"
    },
    accent: "#c4736a"
  },
  {
    id: "31",
    title: "Yehh\u00a0Jadu Hai Jinn Ka",
    artist: "Screen Journal",
    album: "Full Song",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/jwb5P46FqY0/hqdefault.jpg"
    },
    playback: {
      youtubeId: "jwb5P46FqY0"
    },
    accent: "#c4736a"
  },
  {
    id: "32",
    title: "Judaai",
    artist: "Sachin Jigar",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/-2K0-RwxVIE/hqdefault.jpg"
    },
    playback: {
      youtubeId: "-2K0-RwxVIE"
    },
    accent: "#c4736a"
  },
  {
    id: "33",
    title: "Paresh Pahuja",
    artist: "Paresh Pahuja",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/9T-Zbxg9X_4/hqdefault.jpg"
    },
    playback: {
      youtubeId: "9T-Zbxg9X_4"
    },
    accent: "#c4736a"
  },
  {
    id: "34",
    title: "Shyamal Sanware",
    artist: "Saregama Music",
    album: "Krishnavataram Part 1",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/8clRfKww5vI/hqdefault.jpg"
    },
    playback: {
      youtubeId: "8clRfKww5vI"
    },
    accent: "#c4736a"
  },
  {
    id: "35",
    title: "Coke Studio Season 9",
    artist: "Coke Studio Pakistan",
    album: "Afreen Afreen",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/kw4tT7SCmaY/hqdefault.jpg"
    },
    playback: {
      youtubeId: "kw4tT7SCmaY"
    },
    accent: "#c4736a"
  },
  {
    id: "36",
    title: "Thodi Der  - Farhan Saeed & Shreya Ghoshal",
    artist: "Nova Nest 56",
    album: "Half Girlfriend",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/8Gz8ti7J-CI/hqdefault.jpg"
    },
    playback: {
      youtubeId: "8Gz8ti7J-CI"
    },
    accent: "#c4736a"
  },
  {
    id: "37",
    title: "Yeh Ratein Yeh Mausam",
    artist: "Pyaar Bhare Geet",
    album: "Kishore & Asha's EVERGREEN ROMANCE",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/HUy4_yZi2L4/hqdefault.jpg"
    },
    playback: {
      youtubeId: "HUy4_yZi2L4"
    },
    accent: "#c4736a"
  },
  {
    id: "38",
    title: "Humnava - Full",
    artist: "Sony Music India",
    album: "Hamari Adhuri Kahani",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/ktPD6TMovxs/hqdefault.jpg"
    },
    playback: {
      youtubeId: "ktPD6TMovxs"
    },
    accent: "#c4736a"
  },
  {
    id: "39",
    title: "Dard Dilo Ke",
    artist: "AI Fact Bites",
    album: "Kam Ni Hota",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/Id_cRqCxduw/hqdefault.jpg"
    },
    playback: {
      youtubeId: "Id_cRqCxduw"
    },
    accent: "#c4736a"
  },
  {
    id: "40",
    title: "Itna Na Mujhse Tu Pyaar Badha  - HD",
    artist: "Sadabahar HD Songs",
    album: "Chhaya(1961)",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/Q__-cYB1u18/hqdefault.jpg"
    },
    playback: {
      youtubeId: "Q__-cYB1u18"
    },
    accent: "#c4736a"
  },
  {
    id: "41",
    title: "Lata Mangeshkar : Lag Ja Gale",
    artist: "Dard Bhare Songs",
    album: "Old Hindi Sad Song",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/DFbbpMD3taw/hqdefault.jpg"
    },
    playback: {
      youtubeId: "DFbbpMD3taw"
    },
    accent: "#c4736a"
  },
  {
    id: "42",
    title: "Mujhe Pyaar Hua Tha; What You Want & What Your Destiny Wants",
    artist: "AFI7?",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/6EMUjQ8fEqc/hqdefault.jpg"
    },
    playback: {
      youtubeId: "6EMUjQ8fEqc"
    },
    accent: "#c4736a"
  },
  {
    id: "43",
    title: "Mere Samne Wali Khidki Mein",
    artist: "Rajshri",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/S0WPSYFm7iE/hqdefault.jpg"
    },
    playback: {
      youtubeId: "S0WPSYFm7iE"
    },
    accent: "#c4736a"
  },
  {
    id: "44",
    title: "MERE \u041c\u0415\u041d\u0412\u041e\u041e\u0412 QAYAMAT HOGI \ud83e\udd79 old is gold song",
    artist: "Bat of music 90s ",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/POpSYoQhj88/hqdefault.jpg"
    },
    playback: {
      youtubeId: "POpSYoQhj88"
    },
    accent: "#c4736a"
  },
  {
    id: "45",
    title: "Hum Tere Pyar Mein Sara Aalam",
    artist: "Hindi Filmi Songs",
    album: "Dil Ek Mandir",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/zgeRC9vrtrM/hqdefault.jpg"
    },
    playback: {
      youtubeId: "zgeRC9vrtrM"
    },
    accent: "#c4736a"
  },
  {
    id: "46",
    title: "Aankhein Khuli Song",
    artist: "YRF",
    album: "Mohabbatein",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/eM8Mjuq4MwQ/hqdefault.jpg"
    },
    playback: {
      youtubeId: "eM8Mjuq4MwQ"
    },
    accent: "#c4736a"
  },
  {
    id: "47",
    title: "SANAM",
    artist: "Sanam",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/4HRC6c5-2lQ/hqdefault.jpg"
    },
    playback: {
      youtubeId: "4HRC6c5-2lQ"
    },
    accent: "#c4736a"
  },
  {
    id: "48",
    title: "Main Kabhi Bhoolunga Na Tujhe",
    artist: "UviSg",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/WS4guFHkYBw/hqdefault.jpg"
    },
    playback: {
      youtubeId: "WS4guFHkYBw"
    },
    accent: "#c4736a"
  },
  {
    id: "49",
    title: "Phir Le Aya Dil - Audio",
    artist: "Sony Music India",
    album: "Arijit Singh",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/s9q_82OQsJE/hqdefault.jpg"
    },
    playback: {
      youtubeId: "s9q_82OQsJE"
    },
    accent: "#c4736a"
  },
  {
    id: "50",
    title: "Azaan Sami Khan",
    artist: "Azaan Sami Khan",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/J7ck984Qhso/hqdefault.jpg"
    },
    playback: {
      youtubeId: "J7ck984Qhso"
    },
    accent: "#c4736a"
  },
  {
    id: "51",
    title: "Sun Raha Hai Na Tu  Slow & Reverb",
    artist: "SlowVibe Music",
    album: "Shreya Ghoshal",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/FGt1PxPKWUM/hqdefault.jpg"
    },
    playback: {
      youtubeId: "FGt1PxPKWUM"
    },
    accent: "#c4736a"
  },
  {
    id: "52",
    title: "O Meri Laila -",
    artist: "Dance Masti Hits",
    album: "Laila Majnu",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/aCWoO3xxtTI/hqdefault.jpg"
    },
    playback: {
      youtubeId: "aCWoO3xxtTI"
    },
    accent: "#c4736a"
  },
  {
    id: "53",
    title: "Ishq Hai",
    artist: "Anurag Saikia",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/TQqBjSAK52s/hqdefault.jpg"
    },
    playback: {
      youtubeId: "TQqBjSAK52s"
    },
    accent: "#c4736a"
  },
  {
    id: "54",
    title: "Channa Mereya - Lyric",
    artist: "Heart Beats official",
    album: "Ae Dil Hai Mushkil",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/hk0u0PAlDWQ/hqdefault.jpg"
    },
    playback: {
      youtubeId: "hk0u0PAlDWQ"
    },
    accent: "#c4736a"
  },
  {
    id: "55",
    title: "Maana Ke Hum Yaar Nahin",
    artist: "YRF",
    album: "Duet",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/D9N7qAyLofE/hqdefault.jpg"
    },
    playback: {
      youtubeId: "D9N7qAyLofE"
    },
    accent: "#c4736a"
  },
  {
    id: "56",
    title: "Toota Jo Kabhi Tara \u2728-A Flying Jatt",
    artist: "Bollywood In 8K",
    album: "Tiger Shroff, Jacqueline Fernandez",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/lHWDJlBPTHo/hqdefault.jpg"
    },
    playback: {
      youtubeId: "lHWDJlBPTHo"
    },
    accent: "#c4736a"
  },
  {
    id: "57",
    title: "Rozana Full  Song",
    artist: "T-Series",
    album: "Naam Shabana",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/CtgD91Ev4NU/hqdefault.jpg"
    },
    playback: {
      youtubeId: "CtgD91Ev4NU"
    },
    accent: "#c4736a"
  },
  {
    id: "58",
    title: "Main Koi Aisa Geet Gaoon - HD",
    artist: "Ishtar Music",
    album: "Shah Rukh Khan & Juhi Chawla",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/vzlXfZlH5dk/hqdefault.jpg"
    },
    playback: {
      youtubeId: "vzlXfZlH5dk"
    },
    accent: "#c4736a"
  },
  {
    id: "59",
    title: "",
    artist: "YRF",
    album: "Bulleya Song with Lyrics",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/_51KXfwcPMs/hqdefault.jpg"
    },
    playback: {
      youtubeId: "_51KXfwcPMs"
    },
    accent: "#c4736a"
  },
  {
    id: "60",
    title: "Full : Raanjhan",
    artist: "T-Series",
    album: "Do Patti",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/lBvbNxiVmZA/hqdefault.jpg"
    },
    playback: {
      youtubeId: "lBvbNxiVmZA"
    },
    accent: "#c4736a"
  },
  {
    id: "61",
    title: "Meri Mehbooba",
    artist: "90s Sagar Sangeet",
    album: "Pardes",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/2V0ZcN-gOdc/hqdefault.jpg"
    },
    playback: {
      youtubeId: "2V0ZcN-gOdc"
    },
    accent: "#c4736a"
  },
  {
    id: "62",
    title: "Humnava Full  - Hamari Adhuri Kahani",
    artist: "Sony Music India",
    album: "Emraan Hashmi, Vidya Balan",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/kdCUNPX8fz4/hqdefault.jpg"
    },
    playback: {
      youtubeId: "kdCUNPX8fz4"
    },
    accent: "#c4736a"
  },
  {
    id: "63",
    title: "Dhadak - Title Track",
    artist: "Ishq Beats",
    album: "Full Video",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/46FsHy_J7oQ/hqdefault.jpg"
    },
    playback: {
      youtubeId: "46FsHy_J7oQ"
    },
    accent: "#c4736a"
  },
  {
    id: "64",
    title: "Be Intehaan",
    artist: "Bollywood Blockbusters",
    album: "Race 2 I Saif Ali Khan & Deepika Padukone",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/r_3K9vZ4oZE/hqdefault.jpg"
    },
    playback: {
      youtubeId: "r_3K9vZ4oZE"
    },
    accent: "#c4736a"
  },
  {
    id: "65",
    title: "ITNI SI BAAT HAIN Lyric song",
    artist: "Music background",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/sTRps18IAlw/hqdefault.jpg"
    },
    playback: {
      youtubeId: "sTRps18IAlw"
    },
    accent: "#c4736a"
  },
  {
    id: "66",
    title: "Tera Mera Rishta - New Version",
    artist: "Sony Music India",
    album: "Awarapan 2",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/6rvUyBiBtik/hqdefault.jpg"
    },
    playback: {
      youtubeId: "6rvUyBiBtik"
    },
    accent: "#c4736a"
  },
  {
    id: "67",
    title: "Challa",
    artist: "YRF Punjabi",
    album: "Full Song",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/1GWyCJHuNms/hqdefault.jpg"
    },
    playback: {
      youtubeId: "1GWyCJHuNms"
    },
    accent: "#c4736a"
  },
  {
    id: "68",
    title: "Yeh Fitoor Mera   Fitoor",
    artist: "Bollywood Love Vibes",
    album: "Aditya Roy Kapur, Katrina Kaif",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/QQBiU9U9Fng/hqdefault.jpg"
    },
    playback: {
      youtubeId: "QQBiU9U9Fng"
    },
    accent: "#c4736a"
  },
];
