import "./App.css";
import { relayInit, nip19 } from "nostr-tools";
import { useEffect, useState, useRef } from "react";
import { BrowserRouter as Router, Route, Routes, Link, useParams } from 'react-router-dom';
import channelMap from './channelMap.json';

function StreamPage() {
  const { channelNameOrNoteId } = useParams();
  const [channel, setChannel] = useState(null);
  const [relay, setRelay] = useState(null);
  const [relayStatus, setRelayStatus] = useState("Desconectado");
  const [pubStatus, setPubStatus] = useState("");
  const [streamUrl, setStreamUrl] = useState(null);
  const [streamKeys, setStreamKeys] = useState({});
  const playerRef = useRef(null);
  const relayUrl = "wss://relay.primal.net";

  useEffect(() => {
    const foundChannel = channelMap.channels.find(ch => ch.name === channelNameOrNoteId);
    if (foundChannel) {
      setChannel(foundChannel);
    } else {
      setChannel({ name: channelNameOrNoteId, noteId: channelNameOrNoteId, title: "Stream Directo" });
    }
  }, [channelNameOrNoteId]);

  useEffect(() => {
    const connectRelay = async () => {
      setRelayStatus("Conectando...");
      const relay = relayInit(relayUrl);
      
      relay.on("connect", () => {
        setRelay(relay);
        setRelayStatus("Conectado");
      });
      
      relay.on("error", () => {
        setRelayStatus("Error de conexión");
      });
      
      relay.on("disconnect", () => {
        setRelayStatus("Desconectado");
      });

      try {
        await relay.connect();
      } catch (error) {
        setRelayStatus("Error de conexión");
      }
    };

    connectRelay();
  }, []);

  useEffect(() => {
    if (relay && channel) {
      handleFetchStream();
    }
  }, [relay, channel]);

  const handleFetchStream = async () => {
    try {
      let hexId;
      try {
        const { data } = nip19.decode(channel.noteId);
        hexId = data;
      } catch {
        hexId = channel.noteId;
      }

      const events = await relay.list([
        {
          kinds: [1],
          ids: [hexId],
        }
      ]);

      if (events.length > 0) {
        let content = events[0].content;
        let decodedContent;
        let keys = {};

        if (content.startsWith('https://')) {
          decodedContent = content;
        } else {
          const parts = content.split('&');
          const encodedUrl = parts[0];
          decodedContent = atob(encodedUrl);

          parts.forEach(part => {
            if (part.startsWith('key=')) {
              keys.key = atob(part.split('=')[1]);
            } else if (part.startsWith('key2=')) {
              keys.key2 = atob(part.split('=')[1]);
            }
          });
        }

        setStreamUrl(decodedContent);
        setStreamKeys(keys);
        setPubStatus("URL de stream encontrada y decodificada");

        if (window.jwplayer && playerRef.current) {
          const jwp = window.jwplayer(playerRef.current);
          jwp.setup({
            file: decodedContent,
            type: 'dash',
            drm: {
              clearkey: {
                keyId: keys.key,
                key: keys.key2
              }
            },
            width: "100%",
            height: "100%",
            aspectratio: "16:9",
            stretching: "uniform",
            autostart: false,
            mute: false
          });

          jwp.on('error', function(e) {
            setPubStatus("Error de reproducción: " + e.message);
          });
        }
      } else {
        setPubStatus("No se encontró la nota de stream especificada");
      }
    } catch (error) {
      setPubStatus("Error al buscar nota de stream");
    }
  };

  if (!channel) {
    return <div>Cargando...</div>;
  }

  return (
    <div className="bg-gray-900 min-h-screen flex flex-col items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-md p-6 mb-6 w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-center text-purple-400 mb-4">{channel.title}</h1>
        <p className={`text-center font-semibold ${
          relayStatus === "Conectado" ? "text-green-400" :
          relayStatus === "Desconectado" ? "text-red-400" :
          relayStatus === "Conectando..." ? "text-yellow-400" :
          "text-gray-400"
        }`}>
          Estado del relay: {relayStatus}
        </p>
      </div>
      
      <div className="w-full max-w-2xl aspect-video mb-4" style={{position: 'relative'}}>
        <div ref={playerRef} id="players" style={{
          position: 'absolute', 
          top: '0', 
          left: '0', 
          width: '100%', 
          height: '100%', 
          maxWidth: '100vw', 
          maxHeight: '56.25vw', 
          backgroundColor: 'black'
        }}></div>
      </div>
      
      <p className="text-gray-300 mb-4">Estado de publicación: <span className="font-semibold">{pubStatus}</span></p>
    </div>
  );
}

function App() {
  return (
    <Router>
      <div>
        <nav>
          <ul>
            {channelMap.channels.map((channel, index) => (
              <li key={index}>
                <Link to={`/${channel.name}`}>{channel.title}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <Routes>
          <Route path="/:channelNameOrNoteId" element={<StreamPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
