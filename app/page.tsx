import Camera from "./components/camera";

export default function Home() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <header className="py-2 bg-black text-white text-center">
        <h1 className="text-lg font-bold">Camera Test</h1>
        <p className="text-xs text-white">Note: Camera requires HTTPS on mobile browsers</p>
      </header>
      
      <main className="flex-grow flex items-center justify-center bg-black p-2" style={{ minHeight: 0 }}>
        <div className="w-full h-full" style={{ maxHeight: "calc(100vh - 80px)" }}>
          <Camera />
        </div>
      </main>
      
      <footer className="py-1 text-center text-xs text-gray-400 bg-black">
        Camera Testing Mode
      </footer>
    </div>
  );
}
