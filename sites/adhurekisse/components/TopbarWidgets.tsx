"use client";

import { useState, useEffect } from "react";
import { Cloud } from "lucide-react";
import { supabase } from "../lib/supabase";

export function LiveListeners() {
  const [listeners, setListeners] = useState(1);

  useEffect(() => {
    if (!supabase) return;
    
    // Generate a consistent user ID for this session
    let userId = sessionStorage.getItem("adhure_user_id");
    if (!userId) {
      userId = Math.random().toString(36).substring(2);
      sessionStorage.setItem("adhure_user_id", userId);
    }

    const room = supabase.channel('online-users');

    room
      .on('presence', { event: 'sync' }, () => {
        const newState = room.presenceState();
        // sum up all connected clients
        let count = 0;
        for (const key in newState) {
          count += newState[key].length;
        }
        setListeners(Math.max(1, count));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await room.track({ user: userId, online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase?.removeChannel(room);
    };
  }, []);

  return (
    <div className="live-listeners" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 500, letterSpacing: '0.1em', color: 'var(--ts)' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
        <div style={{ position: 'absolute', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e', animation: 'ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite' }} />
      </div>
      <span>{listeners} LISTENING</span>
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export function LiveTimeWeather() {
  const [time, setTime] = useState("");
  const [temp, setTemp] = useState<string>("--");

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const options: Intl.DateTimeFormatOptions = { 
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      };
      // Format: HH:MM:SS
      setTime(new Intl.DateTimeFormat('en-GB', options).format(d));
    };
    updateTime();
    const tInterval = setInterval(updateTime, 1000);

    // Weather - basic IP/geolocation based fetch if available
    const fetchWeather = async (lat: number, lon: number) => {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const data = await res.json();
        if (data?.current_weather?.temperature) {
          setTemp(`${Math.round(data.current_weather.temperature)}°C`);
        }
      } catch (e) {
        // ignore
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => fetchWeather(28.6139, 77.2090) // Fallback to New Delhi
      );
    } else {
      fetchWeather(28.6139, 77.2090);
    }

    return () => clearInterval(tInterval);
  }, []);

  return (
    <div className="live-time-weather" style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', fontWeight: 500, letterSpacing: '0.1em', color: 'var(--ts)', opacity: 0.8 }}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>IST {time}</span>
      <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--tb)' }} />
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Cloud size={14} /> {temp}
      </span>
    </div>
  );
}
