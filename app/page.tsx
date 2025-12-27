"use client";

import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { useState, useEffect, useRef } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  Settings, BookOpen, Calculator, Globe, Beaker, PenTool, 
  Send, User, Bot, RotateCcw, Cpu, Landmark, Trash2, Paperclip, X, ExternalLink, Zap 
} from "lucide-react";

type Message = {
  role: "user" | "model";
  text: string;
  image?: string;
  isLite?: boolean; // Liteモデルで回答した場合のフラグ
};

// --- システムプロンプト ---
const SYSTEM_PROMPTS: Record<string, string> = {
  Japanese: "あなたは国語のプロ講師です。画像で選択肢問題が送られた場合、必ず画像内に存在する選択肢（ア〜エ、1〜4など）の中から正解を選んでください。絶対に独自の選択肢を創作しないでください。解説は論理的に行ってください。",
  Math: "あなたは数学のプロ講師です。数式はLaTeX形式（例: $y=ax^2+bx+c$）で出力してください。画像で問題が送られた場合、その数式や図形を読み取って、解法プロセスを丁寧に解説してください。選択肢問題の場合は、必ず画像内にある選択肢の中から選んでください。",
  English: "You are a strict native English teacher. If the user uploads a multiple-choice question image, YOU MUST SELECT from the visible options. Do NOT invent a new option.",
  Physics: "あなたは物理のプロ講師です。画像の問題を解説する際、選択肢式であれば、必ず提示されている選択肢の中から最も適切なものを選んでください。画像にない選択肢を回答に含めることは禁止です。",
  Chemistry: "あなたは化学のプロ講師です。画像内の実験器具や反応式を読み取ってください。選択肢問題の場合、画像に書かれている選択肢（①〜④など）の中から正解を選び、なぜそれが正解かを解説してください。",
  PolEco: "あなたは「政治・経済」のプロ講師です。グラフや資料問題において、選択肢が提示されている場合は、必ずその中から正解を選んでください。独自の選択肢を作成することは禁止です。",
  J_History: "あなたは厳格な「日本史」のプロ講師です。資料問題などで選択肢がある場合、必ず画像内の選択肢から選んでください。教科書（山川出版社）の記述に基づき、なぜその選択肢が正しいかを解説してください。",
  W_History: "あなたは厳格な「世界史」のプロ講師です。地図や絵画問題で選択肢がある場合、必ず画像内の選択肢から選んでください。独自の選択肢を作らず、消去法などを用いて解説してください。",
  Free: "あなたは優秀なAIアシスタントです。選択肢問題が送られた場合は、その中から正解を選んでください。"
};

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [isKeySaved, setIsKeySaved] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isLiteMode, setIsLiteMode] = useState(false); // 現在Liteで動いているか表示用
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem("gemini_api_key");
    if (savedKey) {
      setApiKey(savedKey);
      setIsKeySaved(true);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (selectedSubject && messages.length > 0) {
      localStorage.setItem(`history_${selectedSubject}`, JSON.stringify(messages));
    }
  }, [messages, selectedSubject]);

  const handleSaveKey = () => {
    if (!apiKey) return;
    const trimmedKey = apiKey.trim();
    localStorage.setItem("gemini_api_key", trimmedKey);
    setApiKey(trimmedKey);
    setIsKeySaved(true);
  };

  const handleClearKey = () => {
    if(confirm("APIキーを削除しますか？")) {
      localStorage.removeItem("gemini_api_key");
      setApiKey("");
      setIsKeySaved(false);
      setSelectedSubject(null);
      setMessages([]);
    }
  };

  const handleSubjectSelect = (subject: string) => {
    setSelectedSubject(subject);
    const savedHistory = localStorage.getItem(`history_${subject}`);
    if (savedHistory) {
      setMessages(JSON.parse(savedHistory));
    } else {
      setMessages([]); 
    }
    setSelectedImage(null);
    setIsLiteMode(false);
  };

  const handleClearHistory = () => {
    if (!selectedSubject) return;
    if (confirm(`「${selectedSubject}」の会話履歴をすべて消去しますか？`)) {
      localStorage.removeItem(`history_${selectedSubject}`);
      setMessages([]);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("画像サイズが大きすぎます（5MB以下にしてください）");
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
    };
  };

  // --- ★自動フォールバック機能付き送信ハンドラー ---
  const handleSendMessage = async () => {
    if ((!input.trim() && !selectedImage) || !apiKey || !selectedSubject) return;

    const userMessageText = input;
    const userImage = selectedImage;

    setMessages((prev) => [...prev, { 
      role: "user", 
      text: userMessageText,
      image: userImage || undefined
    }]);

    setInput("");
    setSelectedImage(null);
    setIsLoading(true);
    setIsLiteMode(false);

    // 共通のデータ構築処理
    const buildParts = () => {
      const parts: any[] = [];
      if (userImage) {
        const base64Data = userImage.split(",")[1];
        const mimeType = userImage.split(":")[1].split(";")[0];
        parts.push({
          inlineData: { data: base64Data, mimeType: mimeType }
        });
      }
      if (userMessageText) {
        parts.push({ text: userMessageText });
      } else if (userImage) {
        parts.push({ text: "この画像を解説してください。" });
      }
      return parts;
    };

    const buildHistory = () => {
      return messages.map(m => {
        const safeText = m.text.trim() === "" ? "（画像またはファイルが送信されました）" : m.text;
        return {
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: safeText }] 
        };
      });
    };

    try {
      const genAI = new GoogleGenerativeAI(apiKey.trim());
      
      // ① まずメインモデル (2.5-flash) で試行
      try {
        const model = genAI.getGenerativeModel({ 
          model: "gemini-2.5-flash", 
          systemInstruction: SYSTEM_PROMPTS[selectedSubject],
          generationConfig: { temperature: 0.4 }
        });

        const chat = model.startChat({ history: buildHistory() });
        const result = await chat.sendMessage(buildParts());
        const response = result.response.text();
        
        setMessages((prev) => [...prev, { role: "model", text: response }]);

      } catch (primaryError: any) {
        // エラー内容を確認
        const errorMsg = primaryError.message || "";
        // 429エラー(Quota) または 503(Overloaded) の場合のみLiteへ切り替え
        if (errorMsg.includes("429") || errorMsg.includes("Quota") || errorMsg.includes("503")) {
          
          console.warn("メインモデルが制限に達しました。Liteモデルに切り替えます。");
          setIsLiteMode(true);

          // ② Liteモデル (2.5-flash-lite) で再試行
          const liteModel = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash-lite", 
            systemInstruction: SYSTEM_PROMPTS[selectedSubject],
            generationConfig: { temperature: 0.4 }
          });

          const liteChat = liteModel.startChat({ history: buildHistory() });
          const liteResult = await liteChat.sendMessage(buildParts());
          const liteResponse = liteResult.response.text();

          setMessages((prev) => [...prev, { 
            role: "model", 
            text: liteResponse,
            isLite: true // Liteフラグを立てる
          }]);

        } else {
          // それ以外のエラー（認証エラーなど）はそのままスロー
          throw primaryError;
        }
      }

    } catch (error: any) {
      console.error(error);
      const errorMsg = error.message || "不明なエラー";
      setMessages((prev) => [...prev, { 
        role: "model", 
        text: `【エラーが発生しました】\n詳細: ${errorMsg}\n\n※APIキーが無効か、すべてのモデルが制限に達している可能性があります。` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 p-4 md:p-8 font-sans">
      
      {/* ヘッダー */}
      <div className="max-w-4xl mx-auto flex justify-between items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-blue-600 flex items-center gap-2">
          🎓 5-Subject AI Tutor
        </h1>
        {isKeySaved && (
          <button onClick={handleClearKey} className="text-xs md:text-sm text-gray-500 hover:text-red-500 flex items-center gap-1">
            <Settings size={16} /> 設定解除
          </button>
        )}
      </div>

      <div className="max-w-4xl mx-auto">
        {!isKeySaved ? (
          // --- 初期設定画面 ---
          <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-200 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold mb-4">初期設定</h2>
            <p className="text-gray-600 mb-6">
              Google AI StudioのAPIキーを入力してください。<br/>
              <a 
                href="https://aistudio.google.com/api-keys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm inline-flex items-center gap-1 my-2 font-medium"
              >
                (APIキーの発行はこちらから <ExternalLink size={12} />)
              </a>
              <br/>
              <span className="text-sm text-gray-400">（キーはブラウザにのみ保存されます）</span>
            </p>
            <div className="flex gap-2 justify-center">
              <input
                type="password"
                placeholder="AIzaSy..."
                className="border p-3 rounded-lg w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button 
                onClick={handleSaveKey}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-bold whitespace-nowrap"
              >
                保存
              </button>
            </div>
          </div>
        ) : !selectedSubject ? (
          // --- 科目選択画面 ---
          <div className="animate-in fade-in zoom-in duration-300">
            <h2 className="text-2xl font-bold mb-6 text-center text-gray-700">今日は何を勉強しますか？</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
              {/* 1行目 */}
              <SubjectButton name="国語" icon={<BookOpen />} color="bg-red-50 text-red-600 hover:bg-red-100 ring-red-200" onClick={() => handleSubjectSelect("Japanese")} />
              <SubjectButton name="数学" icon={<Calculator />} color="bg-blue-50 text-blue-600 hover:bg-blue-100 ring-blue-200" onClick={() => handleSubjectSelect("Math")} />
              <SubjectButton name="英語" icon={<Globe />} color="bg-orange-50 text-orange-600 hover:bg-orange-100 ring-orange-200" onClick={() => handleSubjectSelect("English")} />
              
              {/* 2行目 */}
              <SubjectButton name="物理" icon={<Cpu />} color="bg-green-50 text-green-600 hover:bg-green-100 ring-green-200" onClick={() => handleSubjectSelect("Physics")} />
              <SubjectButton name="化学" icon={<Beaker />} color="bg-teal-50 text-teal-600 hover:bg-teal-100 ring-teal-200" onClick={() => handleSubjectSelect("Chemistry")} />
              <SubjectButton name="政経" icon={<Landmark />} color="bg-gray-50 text-gray-600 hover:bg-gray-100 ring-gray-200" onClick={() => handleSubjectSelect("PolEco")} />

              {/* 3行目 */}
              <SubjectButton name="日本史" icon={<PenTool />} color="bg-yellow-50 text-yellow-600 hover:bg-yellow-100 ring-yellow-200" onClick={() => handleSubjectSelect("J_History")} />
              <SubjectButton name="世界史" icon={<Globe />} color="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 ring-indigo-200" onClick={() => handleSubjectSelect("W_History")} />
              <SubjectButton name="自由" icon={<Bot />} color="bg-purple-50 text-purple-600 hover:bg-purple-100 ring-purple-200" onClick={() => handleSubjectSelect("Free")} />
            </div>
          </div>
        ) : (
          // --- チャット画面 ---
          <div className="bg-white rounded-xl shadow-xl overflow-hidden flex flex-col h-[75vh] animate-in slide-in-from-right duration-300 border border-gray-200">
            {/* チャットヘッダー */}
            <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <span className="text-blue-600">{selectedSubject}</span> の先生
              </h2>
              
              <div className="flex gap-2">
                <button 
                  onClick={handleClearHistory} 
                  className="text-sm text-red-400 hover:bg-red-50 hover:text-red-600 px-3 py-1.5 rounded-lg flex items-center gap-1 transition"
                  title="履歴を消去"
                >
                  <Trash2 size={16}/>
                </button>
                <button 
                  onClick={() => setSelectedSubject(null)} 
                  className="text-sm text-gray-500 hover:bg-gray-200 px-3 py-1.5 rounded-lg flex items-center gap-1 transition"
                >
                  <RotateCcw size={16}/> 科目選択へ
                </button>
              </div>
            </div>

            {/* メッセージエリア */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
              {messages.length === 0 && (
                <div className="text-center text-gray-400 mt-20">
                  <p className="text-4xl mb-2">👋</p>
                  <p>質問、または画像の解説をします。<br/>AI講師が待機しています。</p>
                </div>
              )}
              {messages.map((msg, index) => (
                <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] md:max-w-[70%] p-4 rounded-2xl shadow-sm ${
                    msg.role === "user" 
                      ? "bg-blue-600 text-white rounded-tr-none" 
                      : "bg-white text-gray-800 border border-gray-100 rounded-tl-none"
                  }`}>
                    <div className="flex items-center gap-2 mb-1 opacity-70 text-xs">
                      {msg.role === "user" ? <User size={12}/> : <Bot size={12}/>}
                      {msg.role === "user" ? "あなた" : "AI先生"}
                      {/* Liteモデルで回答した場合の表示 */}
                      {msg.isLite && (
                        <span className="flex items-center gap-1 text-orange-500 ml-2">
                          <Zap size={10} fill="currentColor"/> Lite
                        </span>
                      )}
                    </div>
                    
                    {msg.image && (
                      <div className="mb-2">
                        <img src={msg.image} alt="送信画像" className="max-w-full rounded-lg border border-gray-200 max-h-60 object-contain bg-black/5" />
                      </div>
                    )}

                    {msg.role === "user" ? (
                      <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                    ) : (
                      <MarkdownRenderer content={msg.text} />
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-gray-100 flex items-center gap-2 text-gray-400">
                    <Bot size={16} className="animate-bounce" />
                    <span className="text-sm">
                      {isLiteMode ? "Liteモデルで再試行中..." : "考え中..."}
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 入力エリア */}
            <div className="p-4 bg-white border-t">
              {selectedImage && (
                <div className="mb-2 flex items-center gap-2 animate-in slide-in-from-bottom-2">
                  <div className="relative">
                    <img src={selectedImage} alt="Preview" className="h-16 w-16 object-cover rounded-lg border border-gray-200" />
                    <button 
                      onClick={() => setSelectedImage(null)}
                      className="absolute -top-2 -right-2 bg-gray-500 text-white rounded-full p-0.5 hover:bg-red-500 transition"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <span className="text-xs text-gray-500">この画像を送信します</span>
                </div>
              )}

              <div className="flex gap-2 relative">
                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleImageSelect}
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-gray-100 text-gray-500 p-3 rounded-xl hover:bg-gray-200 transition flex-shrink-0"
                  title="画像を添付"
                >
                  <Paperclip size={20} />
                </button>

                <textarea
                  className="w-full border border-gray-300 rounded-xl p-3 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none h-14"
                  placeholder="質問を入力... (Shift+Enterで改行)"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={isLoading || (!input.trim() && !selectedImage)}
                  className="absolute right-2 top-2 bottom-2 bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <Send size={20} />
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">
                Gemini 2.5 Flash {isLiteMode && "(Lite)"} を使用中。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SubjectButton({ name, icon, color, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={`${color} ring-1 p-6 md:p-8 rounded-2xl flex flex-col items-center gap-3 transition-all duration-200 transform hover:-translate-y-1 hover:shadow-lg`}
    >
      <span className="text-3xl md:text-4xl">{typeof icon === 'string' ? icon : icon}</span>
      <span className="text-lg md:text-xl font-bold">{name}</span>
    </button>
  );
}