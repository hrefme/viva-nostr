import "./App.css";
import { relayInit, nip19 } from "nostr-tools";
import { useEffect, useState, useRef } from "react";
import { BrowserRouter as Router, Route, Routes, Link, useParams, useNavigate } from 'react-router-dom';
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
  const [customNoteId, setCustomNoteId] = useState("");
  const navigate = useNavigate();

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
          
          const streamType = decodedContent.toLowerCase().includes('.m3u8') ? 'hls' : 'dash';
          
          const playerSetup = {
            file: decodedContent,
            type: streamType,
            width: "100%",
            height: "100%",
            aspectratio: "16:9",
            stretching: "uniform",
            autostart: false,
            mute: false
          };

          if (Object.keys(keys).length > 0) {
            playerSetup.drm = {
              clearkey: {
                keyId: keys.key,
                key: keys.key2
              }
            };
          }

          jwp.setup(playerSetup);

          jwp.on('error', function(e) {
            setPubStatus("Error de reproducción: " + e.message);
          });
        }
      } else {
        setPubStatus("No se encontró la nota de stream especificada");
      }
    } catch (error) {
      setPubStatus("Error al buscar nota de stream: " + error.message);
    }
  };

  const handleCustomNoteIdSubmit = (e) => {
    e.preventDefault();
    if (customNoteId) {
      navigate(`/${customNoteId}`);
    }
  };

  if (!channel) {
    return <div className="flex justify-center items-center h-screen bg-gray-900">
      <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-purple-500"></div>
    </div>;
  }

  return (
    <div className="bg-gray-900 min-h-screen flex flex-col items-center justify-start p-8">
      <div className="bg-gray-800 rounded-lg shadow-md p-8 mb-8 w-full max-w-7xl">
        <h1 className="text-6xl font-bold text-center text-purple-400 mb-6">{channel.title}</h1>
        <p className={`text-center text-3xl font-semibold ${
          relayStatus === "Conectado" ? "text-green-400" :
          relayStatus === "Desconectado" ? "text-red-400" :
          relayStatus === "Conectando..." ? "text-yellow-400" :
          "text-gray-400"
        }`}>
          Estado del relay: {relayStatus}
        </p>
      </div>
      
      <div className="w-full max-w-7xl aspect-video mb-8 rounded-lg overflow-hidden shadow-2xl">
        <div ref={playerRef} id="players" style={{
          width: '100%', 
          height: '100%', 
          backgroundColor: 'black'
        }}></div>
      </div>
      
      <p className="text-gray-300 text-3xl mb-6">Estado de publicación: <span className="font-semibold">{pubStatus}</span></p>

      <form onSubmit={handleCustomNoteIdSubmit} className="w-full max-w-5xl mb-8">
        <div className="flex items-center border-b-2 border-purple-500 py-2">
          <input 
            className="appearance-none bg-transparent border-none w-full text-white mr-3 py-3 px-4 leading-tight focus:outline-none text-2xl"
            type="text" 
            placeholder="Ingrese noteId personalizado" 
            value={customNoteId}
            onChange={(e) => setCustomNoteId(e.target.value)}
          />
          <button 
            className="flex-shrink-0 bg-purple-500 hover:bg-purple-700 border-purple-500 hover:border-purple-700 text-2xl border-4 text-white py-3 px-6 rounded"
            type="submit"
          >
            Ir
          </button>
        </div>
      </form>
    </div>
  );
}

function App() {
  return (
    <Router>
      <div className="bg-gray-900 min-h-screen">
        <nav className="bg-gray-800 p-6">
          <ul className="flex flex-wrap justify-center space-x-8">
            {channelMap.channels.map((channel, index) => (
              <li key={index}>
                <Link 
                  to={`/${channel.name}`}
                  className="text-purple-300 hover:text-purple-100 transition-colors duration-200 text-2xl"
                >
                  {channel.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Routes>
          <Route path="/:channelNameOrNoteId" element={<StreamPage />} />
          <Route path="/" element={<div className="text-white text-center mt-20 text-3xl">Seleccione un canal o ingrese un noteId personalizado</div>} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
