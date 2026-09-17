export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#07070f] text-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300 mb-3">Privacy</p>
        <h1 className="text-4xl font-extrabold tracking-tight">How Hikanest uses audio</h1>
        <p className="text-white/60 mt-4 leading-relaxed">
          Hikanest is an on-screen meeting assistant. It is built so you can see an answer without the app joining the call as a bot.
        </p>

        <h2 className="text-xl font-semibold mt-10">Audio</h2>
        <p className="text-white/60 mt-3 leading-relaxed">
          When you press Listen, the desktop app captures meeting or microphone audio on your computer. That clip is sent to our API, then to OpenAI, only to transcribe the question and write the on-screen answer. We do not keep the audio file after transcription finishes. Hikanest never plays answers out loud.
        </p>

        <h2 className="text-xl font-semibold mt-10">Transcripts and answers</h2>
        <p className="text-white/60 mt-3 leading-relaxed">
          If you leave Save transcript on, the session text and answers stay in your account so you can reopen history. Turn that off and the session is not kept after you press End.
        </p>

        <h2 className="text-xl font-semibold mt-10">Resume and documents</h2>
        <p className="text-white/60 mt-3 leading-relaxed">
          Uploaded resume and job-description files are read as text so answers can sound like you. They are stored in your account so the same session can reuse them. Remove them from Documents when you do not want them used.
        </p>

        <h2 className="text-xl font-semibold mt-10">Account</h2>
        <p className="text-white/60 mt-3 leading-relaxed">
          Sign-in uses Firebase Auth. Credits and plan status live on your user record so the overlay can tell you when to upgrade.
        </p>
      </div>
    </div>
  );
}
