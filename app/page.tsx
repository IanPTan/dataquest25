import Camera from "./components/camera";

export default function Home() {
  return (
    <div className="flex flex-col h-screen w-screen">
      <header className="py-4 bg-black text-white text-center">
        <h1 className="text-xl font-bold">Camera Test</h1>
      </header>
      
      <main className="flex-1 flex items-center justify-center bg-gray-900 p-4">
        <div className="w-full h-full max-w-4xl max-h-[70vh]">
          <Camera />
        </div>
      </main>
      
      <footer className="py-2 text-center text-sm text-gray-400 bg-black">
        Camera Testing Mode
      </footer>
    </div>
  );
}
