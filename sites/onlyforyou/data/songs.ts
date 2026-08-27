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
    artist: "Arijit Singh, Antara Mitra",
    album: undefined,
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/O1OVTHGEi0M/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "O1OVTHGEi0M"
    },
    accent: "#b87c72"
  },
  {
    id: "02",
    title: "Aahista",
    artist: "Arijit Singh, Jonita Gandhi",
    album: undefined,
    year: "2018",
    artwork: {
      cover: "https://i.ytimg.com/vi/d_2a5_S_6nU/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "d_2a5_S_6nU"
    },
    accent: "#a87868"
  },
  {
    id: "03",
    title: "Tere Nishan",
    artist: "Stebin Ben",
    album: undefined,
    year: "2021",
    artwork: {
      cover: "https://i.ytimg.com/vi/7VZ-VQMZRAU/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "7VZ-VQMZRAU"
    },
    accent: "#9a7088"
  },
  {
    id: "04",
    title: "Banjaara",
    artist: "Mohit Chauhan",
    album: undefined,
    year: "2014",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e0279cdf16a9f8c7ab4e9e7b3bb"
    },
    playback: {

      youtubeId: "jYNkeyRSI14"
    },
    accent: "#c09060"
  },
  {
    id: "05",
    title: "Chand Sifarish",
    artist: "Shaan, Kailash Kher",
    album: undefined,
    year: "2006",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02b8e7e6060ad95f7e28ed8a46"
    },
    playback: {

      youtubeId: "8JiNSI2i9eg"
    },
    accent: "#8890b0"
  },
  {
    id: "06",
    title: "Galliyan",
    artist: "Ankit Tiwari",
    album: undefined,
    year: "2014",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e0279cdf16a9f8c7ab4e9e7b3bb"
    },
    playback: {

      youtubeId: "kzMDMSTNS7w"
    },
    accent: "#7a7a9a"
  },
  {
    id: "07",
    title: "O Meri Laila",
    artist: "Atif Aslam",
    album: undefined,
    year: "2018",
    artwork: {
      cover: "https://i.ytimg.com/vi/Z4LbxXYFmk0/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "Z4LbxXYFmk0"
    },
    accent: "#b06858"
  },
  {
    id: "08",
    title: "Guzarish",
    artist: "Sonu Nigam, Shreya Ghoshal",
    album: undefined,
    year: "2008",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e025e8f91f7bcf00e7f33d1a86f"
    },
    playback: {

      youtubeId: "0jkXfB2FWog"
    },
    accent: "#a87050"
  },
  {
    id: "09",
    title: "Tum Hi Ho",
    artist: "Arijit Singh",
    album: undefined,
    year: "2013",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02fc1bf88b5df9a36daf1e1804"
    },
    playback: {

      youtubeId: "Umqb9KENgmk"
    },
    accent: "#6870a8"
  },
  {
    id: "10",
    title: "Tu Hai Ki Nahi",
    artist: "Ankit Tiwari",
    album: undefined,
    year: "2015",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e0244b1d659fc18f79c58b0a96c"
    },
    playback: {

      youtubeId: "3-2XS5fFASI"
    },
    accent: "#90a888"
  },
  {
    id: "11",
    title: "Pyar Kiya To Darna Kya",
    artist: "Lata Mangeshkar",
    album: undefined,
    year: "1960",
    artwork: {
      cover: "https://i.ytimg.com/vi/TqBgIAXdH_c/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "TqBgIAXdH_c"
    },
    accent: "#c8a060"
  },
  {
    id: "12",
    title: "To Phir Aao",
    artist: "Mustafa Zahid",
    album: undefined,
    year: "2007",
    artwork: {
      cover: "https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02856c62b19ee9ac851f7022e9"
    },
    playback: {

      youtubeId: "LwMBh-E5BhA"
    },
    accent: "#9060a0"
  },
  {
    id: "13",
    title: "Chahun Main Ya Naa",
    artist: "Arijit Singh, Palak Muchhal",
    album: undefined,
    year: "2013",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02fc1bf88b5df9a36daf1e1804"
    },
    playback: {

      youtubeId: "nWOJE0OJkOM"
    },
    accent: "#a89060"
  },
  {
    id: "14",
    title: "Aaiye Meherban",
    artist: "Asha Bhosle",
    album: undefined,
    year: "1958",
    artwork: {
      cover: "https://i.ytimg.com/vi/2xBD-WVXsXQ/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "2xBD-WVXsXQ"
    },
    accent: "#c8a878"
  },
  {
    id: "15",
    title: "Hafiz Hafiz",
    artist: "Arijit Singh",
    album: undefined,
    year: "2018",
    artwork: {
      cover: "https://i.ytimg.com/vi/ADqBFUB25Bs/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "ADqBFUB25Bs"
    },
    accent: "#a87060"
  },
  {
    id: "16",
    title: "Zaroorat",
    artist: "Mustafa Zahid",
    album: undefined,
    year: "2014",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e0279cdf16a9f8c7ab4e9e7b3bb"
    },
    playback: {

      youtubeId: "1IvkNPqjqxU"
    },
    accent: "#8898b0"
  },
  {
    id: "17",
    title: "Sunn Raha Hai (Rozana)",
    artist: "Ankit Tiwari, Shreya Ghoshal",
    album: undefined,
    year: "2013",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02fc1bf88b5df9a36daf1e1804"
    },
    playback: {

      youtubeId: "hZw3VxOYiWo"
    },
    accent: "#7890a8"
  },
  {
    id: "18",
    title: "Main Yahan Hoon",
    artist: "Udit Narayan",
    album: undefined,
    year: "2004",
    artwork: {
      cover: "https://i.ytimg.com/vi/rHHqSnstl2s/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "rHHqSnstl2s"
    },
    accent: "#b8a070"
  },
  {
    id: "19",
    title: "Shiddat Title Track",
    artist: "Manan Bhardwaj",
    album: undefined,
    year: "2021",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e024a07f94d80e80e1b649c6fd0"
    },
    playback: {

      youtubeId: "V0Q3IMMBhJM"
    },
    accent: "#9880b0"
  },
  {
    id: "20",
    title: "Bairan",
    artist: "Banjaare",
    album: undefined,
    year: "2026",
    artwork: {
      cover: "https://i.ytimg.com/vi/oafxkMv4xnc/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "oafxkMv4xnc"
    },
    accent: "#c07868"
  },
  {
    id: "21",
    title: "Raat Akeli Thi",
    artist: "Tips Official",
    album: "Merry Christmas",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/1yzDUrFVAcU/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "1yzDUrFVAcU"
    },
    accent: "#c4736a"
  },
  {
    id: "22",
    title: "'Mere Nishan' Full Audio Song by Darshan Raval",
    artist: "Outrageous tuber",
    album: "Outrageous tuber",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/GG2q368Mr9g/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "GG2q368Mr9g"
    },
    accent: "#c4736a"
  },
  {
    id: "23",
    title: "\"Suno Na Sangemarmar\" Full Song with Lyrics",
    artist: "T-Series",
    album: "Youngistaan",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/83pr5QLz6Bc/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "83pr5QLz6Bc"
    },
    accent: "#c4736a"
  },
  {
    id: "24",
    title: "Aaj Se Teri -",
    artist: "Zee Music Company",
    album: "Padman",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/NFsEqOBG51M/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "NFsEqOBG51M"
    },
    accent: "#c4736a"
  },
  {
    id: "25",
    title: "Zaalima -",
    artist: "Zee Music Company",
    album: "Raees",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/hhdSyBHuI88/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "hhdSyBHuI88"
    },
    accent: "#c4736a"
  },
  {
    id: "26",
    title: "Jogi -",
    artist: "Zee Music Company",
    album: "Shaadi Mein Zaroor Aana",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/HexFqifusOk/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "HexFqifusOk"
    },
    accent: "#c4736a"
  },
  {
    id: "27",
    title: "Tere Hawaale  Laal Singh Chaddha",
    artist: "T-Series",
    album: "Aamir,Kareena",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/KUpwupYj_tY/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "KUpwupYj_tY"
    },
    accent: "#c4736a"
  },
  {
    id: "28",
    title: "KAUN TUJHE",
    artist: "T-Series",
    album: "M.S. DHONI -THE UNTOLD STORY",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/Ov0YGGSY6gY/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "Ov0YGGSY6gY"
    },
    accent: "#c4736a"
  },
  {
    id: "29",
    title: "Naino Ne Baandhi -",
    artist: "Zee Music Company",
    album: "Gold",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/Y9ozt29tzgs/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "Y9ozt29tzgs"
    },
    accent: "#c4736a"
  },
  {
    id: "30",
    title: "Ik Mulaqaat - Dream Girl",
    artist: "Zee Music Company",
    album: "Ayushmann Khurrana, Nushrat Bharucha",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/zing4uQ3dR4/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "zing4uQ3dR4"
    },
    accent: "#c4736a"
  },
  {
    id: "31",
    title: "Tera Fitoor  - Genius",
    artist: "Tips Official",
    album: "Utkarsh Sharma, Ishita Chauhan",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/qfdShSZZxlg/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "qfdShSZZxlg"
    },
    accent: "#c4736a"
  },
  {
    id: "32",
    title: "Dil Jhoom",
    artist: "Zee Music Company",
    album: "Gadar 2",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/BsqrmY91nUQ/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "BsqrmY91nUQ"
    },
    accent: "#c4736a"
  },
  {
    id: "33",
    title: "Jaan Nisaar -",
    artist: "Zee Music Company",
    album: "Kedarnath",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/vdbP_3o73qI/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "vdbP_3o73qI"
    },
    accent: "#c4736a"
  },
  {
    id: "34",
    title: "Kalank Title Track -",
    artist: "Zee Music Company",
    album: "Alia Bhatt , Varun Dhawan",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/Grr0FlC8SQA/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "Grr0FlC8SQA"
    },
    accent: "#c4736a"
  },
  {
    id: "35",
    title: "Qaafirana",
    artist: "Zee Music Company",
    album: "Kedarnath",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/ZmcBC9-wAXM/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "ZmcBC9-wAXM"
    },
    accent: "#c4736a"
  },
  {
    id: "36",
    title: "Arijit Singh, Pritam",
    artist: "seventyskye",
    album: "seventyskye",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/39ghSEArbf4/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "39ghSEArbf4"
    },
    accent: "#c4736a"
  },
  {
    id: "37",
    title: "dil sambhal ja zara song lyrics",
    artist: "Itz me Arabi",
    album: "Itz me Arabi",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/Xp7XWB_E6fA/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "Xp7XWB_E6fA"
    },
    accent: "#c4736a"
  },
  {
    id: "38",
    title: "Tu Jaane Na Full  - Ajab Prem Ki Ghazab Kahani",
    artist: "RAJAT LFS - TERMIRAIDER",
    album: "Ranbir Kapoor, Katrina",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/BewnzhHlQuk/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "BewnzhHlQuk"
    },
    accent: "#c4736a"
  },
  {
    id: "39",
    title: "Arijit Singh",
    artist: "7clouds Hindi",
    album: "7clouds Hindi",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/8sqDCkVgMbc/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "8sqDCkVgMbc"
    },
    accent: "#c4736a"
  },
  {
    id: "40",
    title: "LYRICS - Main Phir Bhi Tumko Chahunga",
    artist: "LyricalsVerse",
    album: "Arijit Singh, Shashaa Tirupati",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/Am3gIN7TgeQ/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "Am3gIN7TgeQ"
    },
    accent: "#c4736a"
  },
  {
    id: "41",
    title: "Tune Jo Na Kaha Song",
    artist: "Golden Trending Music 🎵",
    album: "New York",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/nUI4rDhiJr4/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "nUI4rDhiJr4"
    },
    accent: "#c4736a"
  },
  {
    id: "42",
    title: "Arijit Singh, Jeet Gannguli",
    artist: "seventyskye",
    album: "seventyskye",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/LTBuUMsfb3s/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "LTBuUMsfb3s"
    },
    accent: "#c4736a"
  },
  {
    id: "43",
    title: "Javed Bashir - Ye Tune Kya Kiya  🎶",
    artist: "Axjou India",
    album: "main dil ka raaz kehta hoon ki jab jab saanse leta hun💭🎤",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/EKcVql4rlss/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "EKcVql4rlss"
    },
    accent: "#c4736a"
  },
  {
    id: "44",
    title: "Arijit Singh, Palak Muchhal - Chahun Main Ya Naa",
    artist: "D-Muze India",
    album: "Aashiqui 2",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/Q4F7MF5Vzt0/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "Q4F7MF5Vzt0"
    },
    accent: "#c4736a"
  },
  {
    id: "45",
    title: "Agar Tum Saath Ho Full Audio Song IITamasha",
    artist: "Ramesh Mudhiraj ",
    album: "",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/5ER0txQD6Ws/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "5ER0txQD6Ws"
    },
    accent: "#c4736a"
  },
  {
    id: "46",
    title: "Arijit Singh",
    artist: "Geet Mantra",
    album: "Jeet Gannguli - Khamoshiyan (Lyrics)",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/LmnpgSc1tKo/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "LmnpgSc1tKo"
    },
    accent: "#c4736a"
  },
  {
    id: "47",
    title: "Rattan Lambiyan  song",
    artist: "Sukoon tapes",
    album: "shershaah",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/5_N2p7kJewA/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "5_N2p7kJewA"
    },
    accent: "#c4736a"
  },
  {
    id: "48",
    title: "Dil Ibaadat",
    artist: "Kay Kay - Topic",
    album: "Kay Kay - Topic",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/IgITZfS7L_8/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "IgITZfS7L_8"
    },
    accent: "#c4736a"
  },
  {
    id: "49",
    title: "Gehra hua - Dhurandar",
    artist: "Prikfonk",
    album: "Arijit Singh",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/lPxxhOUloUM/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "lPxxhOUloUM"
    },
    accent: "#c4736a"
  },
  {
    id: "50",
    title: "Snehil Bhoumik",
    artist: "Snehil Bhoumik",
    album: "Snehil Bhoumik",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/VVMRSec4x40/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "VVMRSec4x40"
    },
    accent: "#c4736a"
  },
  {
    id: "51",
    title: "Yehh Jadu Hai Jinn Ka",
    artist: "Screen Journal",
    album: "Full Song",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/jwb5P46FqY0/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "jwb5P46FqY0"
    },
    accent: "#c4736a"
  },
  {
    id: "52",
    title: "Judaai",
    artist: "Sachin Jigar",
    album: "Sachin Jigar",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/-2K0-RwxVIE/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "-2K0-RwxVIE"
    },
    accent: "#c4736a"
  },
  {
    id: "53",
    title: "Paresh Pahuja",
    artist: "Paresh Pahuja",
    album: "Paresh Pahuja",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/9T-Zbxg9X_4/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "9T-Zbxg9X_4"
    },
    accent: "#c4736a"
  },
  {
    id: "54",
    title: "Shyamal Sanware",
    artist: "Saregama Music",
    album: "Krishnavataram Part 1",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/8clRfKww5vI/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "8clRfKww5vI"
    },
    accent: "#c4736a"
  },
  {
    id: "55",
    title: "Coke Studio Season 9",
    artist: "Coke Studio Pakistan",
    album: "Afreen Afreen",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/kw4tT7SCmaY/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "kw4tT7SCmaY"
    },
    accent: "#c4736a"
  },
  {
    id: "56",
    title: "Thodi Der  - Farhan Saeed & Shreya Ghoshal",
    artist: "Nova Nest 56",
    album: "Half Girlfriend",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/8Gz8ti7J-CI/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "8Gz8ti7J-CI"
    },
    accent: "#c4736a"
  },
  {
    id: "57",
    title: "Yeh Ratein Yeh Mausam",
    artist: "Pyaar Bhare Geet",
    album: "Kishore & Asha's EVERGREEN ROMANCE",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/HUy4_yZi2L4/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "HUy4_yZi2L4"
    },
    accent: "#c4736a"
  },
  {
    id: "58",
    title: "Humnava - Full",
    artist: "Sony Music India",
    album: "Hamari Adhuri Kahani",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/ktPD6TMovxs/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "ktPD6TMovxs"
    },
    accent: "#c4736a"
  },
  {
    id: "59",
    title: "Dard Dilo Ke",
    artist: "AI Fact Bites",
    album: "Kam Ni Hota",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/Id_cRqCxduw/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "Id_cRqCxduw"
    },
    accent: "#c4736a"
  },
  {
    id: "60",
    title: "Itna Na Mujhse Tu Pyaar Badha  - HD",
    artist: "Sadabahar HD Songs",
    album: "Chhaya(1961)",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/Q__-cYB1u18/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "Q__-cYB1u18"
    },
    accent: "#c4736a"
  },
  {
    id: "61",
    title: "Lata Mangeshkar : Lag Ja Gale",
    artist: "Dard Bhare Songs",
    album: "Old Hindi Sad Song",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/DFbbpMD3taw/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "DFbbpMD3taw"
    },
    accent: "#c4736a"
  },
  {
    id: "62",
    title: "Mujhe Pyaar Hua Tha; What You Want & What Your Destiny Wants",
    artist: "AFI7?",
    album: "AFI7?",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/6EMUjQ8fEqc/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "6EMUjQ8fEqc"
    },
    accent: "#c4736a"
  },
  {
    id: "63",
    title: "Mere Samne Wali Khidki Mein",
    artist: "Rajshri",
    album: "Rajshri",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/S0WPSYFm7iE/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "S0WPSYFm7iE"
    },
    accent: "#c4736a"
  },
  {
    id: "64",
    title: "MERE МЕНВООВ QAYAMAT HOGI 🥹 old is gold song",
    artist: "Bat of music 90s ",
    album: "Bat of music 90s ",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/POpSYoQhj88/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "POpSYoQhj88"
    },
    accent: "#c4736a"
  },
  {
    id: "65",
    title: "Hum Tere Pyar Mein Sara Aalam",
    artist: "Hindi Filmi Songs",
    album: "Dil Ek Mandir",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/zgeRC9vrtrM/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "zgeRC9vrtrM"
    },
    accent: "#c4736a"
  },
  {
    id: "66",
    title: "Aankhein Khuli Song",
    artist: "YRF",
    album: "Mohabbatein",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/eM8Mjuq4MwQ/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "eM8Mjuq4MwQ"
    },
    accent: "#c4736a"
  },
  {
    id: "67",
    title: "SANAM",
    artist: "Sanam",
    album: "Sanam",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/4HRC6c5-2lQ/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "4HRC6c5-2lQ"
    },
    accent: "#c4736a"
  },
  {
    id: "68",
    title: "Main Kabhi Bhoolunga Na Tujhe",
    artist: "UviSg",
    album: "",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/WS4guFHkYBw/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "WS4guFHkYBw"
    },
    accent: "#c4736a"
  },
  {
    id: "69",
    title: "Phir Le Aya Dil - Audio",
    artist: "Sony Music India",
    album: "Arijit Singh",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/s9q_82OQsJE/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "s9q_82OQsJE"
    },
    accent: "#c4736a"
  },
  {
    id: "70",
    title: "Azaan Sami Khan",
    artist: "Azaan Sami Khan",
    album: "Azaan Sami Khan",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/J7ck984Qhso/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "J7ck984Qhso"
    },
    accent: "#c4736a"
  },
  {
    id: "71",
    title: "Sun Raha Hai Na Tu  Slow & Reverb",
    artist: "SlowVibe Music",
    album: "Shreya Ghoshal",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/FGt1PxPKWUM/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "FGt1PxPKWUM"
    },
    accent: "#c4736a"
  },
  {
    id: "72",
    title: "O Meri Laila -",
    artist: "Dance Masti Hits",
    album: "Laila Majnu",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/aCWoO3xxtTI/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "aCWoO3xxtTI"
    },
    accent: "#c4736a"
  },
  {
    id: "73",
    title: "Ishq Hai",
    artist: "Anurag Saikia",
    album: "Anurag Saikia",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/TQqBjSAK52s/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "TQqBjSAK52s"
    },
    accent: "#c4736a"
  },
  {
    id: "74",
    title: "Channa Mereya - Lyric",
    artist: "Heart Beats official",
    album: "Ae Dil Hai Mushkil",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/hk0u0PAlDWQ/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "hk0u0PAlDWQ"
    },
    accent: "#c4736a"
  },
  {
    id: "75",
    title: "Maana Ke Hum Yaar Nahin",
    artist: "YRF",
    album: "Duet",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/D9N7qAyLofE/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "D9N7qAyLofE"
    },
    accent: "#c4736a"
  },
  {
    id: "76",
    title: "Toota Jo Kabhi Tara ✨-A Flying Jatt",
    artist: "Bollywood In 8K",
    album: "Tiger Shroff, Jacqueline Fernandez",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/lHWDJlBPTHo/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "lHWDJlBPTHo"
    },
    accent: "#c4736a"
  },
  {
    id: "77",
    title: "Rozana Full  Song",
    artist: "T-Series",
    album: "Naam Shabana",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/CtgD91Ev4NU/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "CtgD91Ev4NU"
    },
    accent: "#c4736a"
  },
  {
    id: "78",
    title: "Main Koi Aisa Geet Gaoon - HD",
    artist: "Ishtar Music",
    album: "Shah Rukh Khan & Juhi Chawla",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/vzlXfZlH5dk/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "vzlXfZlH5dk"
    },
    accent: "#c4736a"
  },
  {
    id: "79",
    title: "",
    artist: "YRF",
    album: "Bulleya Song with Lyrics",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/_51KXfwcPMs/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "_51KXfwcPMs"
    },
    accent: "#c4736a"
  },
  {
    id: "80",
    title: "Full : Raanjhan",
    artist: "T-Series",
    album: "Do Patti",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/lBvbNxiVmZA/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "lBvbNxiVmZA"
    },
    accent: "#c4736a"
  },
  {
    id: "81",
    title: "Meri Mehbooba",
    artist: "90s Sagar Sangeet",
    album: "Pardes",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/2V0ZcN-gOdc/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "2V0ZcN-gOdc"
    },
    accent: "#c4736a"
  },
  {
    id: "82",
    title: "Humnava Full  - Hamari Adhuri Kahani",
    artist: "Sony Music India",
    album: "Emraan Hashmi, Vidya Balan",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/kdCUNPX8fz4/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "kdCUNPX8fz4"
    },
    accent: "#c4736a"
  },
  {
    id: "83",
    title: "Dhadak - Title Track",
    artist: "Ishq Beats",
    album: "Full Video",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/46FsHy_J7oQ/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "46FsHy_J7oQ"
    },
    accent: "#c4736a"
  },
  {
    id: "84",
    title: "Be Intehaan",
    artist: "Bollywood Blockbusters",
    album: "Race 2 I Saif Ali Khan & Deepika Padukone",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/r_3K9vZ4oZE/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "r_3K9vZ4oZE"
    },
    accent: "#c4736a"
  },
  {
    id: "85",
    title: "ITNI SI BAAT HAIN Lyric song",
    artist: "Music background",
    album: "Music background",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/sTRps18IAlw/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "sTRps18IAlw"
    },
    accent: "#c4736a"
  },
  {
    id: "86",
    title: "Tera Mera Rishta - New Version",
    artist: "Sony Music India",
    album: "Awarapan 2",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/6rvUyBiBtik/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "6rvUyBiBtik"
    },
    accent: "#c4736a"
  },
  {
    id: "87",
    title: "Challa",
    artist: "YRF Punjabi",
    album: "Full Song",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/1GWyCJHuNms/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "1GWyCJHuNms"
    },
    accent: "#c4736a"
  },
  {
    id: "88",
    title: "Yeh Fitoor Mera   Fitoor",
    artist: "Bollywood Love Vibes",
    album: "Aditya Roy Kapur, Katrina Kaif",
    year: "2024",
    artwork: {
      cover: "https://i.ytimg.com/vi/QQBiU9U9Fng/maxresdefault.jpg"
    },
    playback: {

      youtubeId: "QQBiU9U9Fng"
    },
    accent: "#c4736a"
  },
];
