using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Baduk
{
    // One serialized GTP channel. Disposing an old match kills its engine; no stale
    // background response is ever allowed to mutate the new game.
    public sealed class KataGoClient : IDisposable
    {
        readonly SemaphoreSlim gate = new SemaphoreSlim(1, 1);
        readonly Process process;
        readonly StringBuilder errors = new StringBuilder();
        volatile bool disposed;
        public KataGoClient(string directory, string writableDirectory)
        {
            Directory.CreateDirectory(writableDirectory);
            process = new Process { StartInfo = new ProcessStartInfo
            {
                FileName = Path.Combine(directory, "katago.exe"),
                Arguments = "gtp -config \"" + Path.Combine(directory, "baduk.cfg") + "\" -model \"" + Path.Combine(directory, "default.bin.gz") + "\" -human-model \"" + Path.Combine(directory, "human.bin.gz") + "\"",
                WorkingDirectory = writableDirectory, UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true
            }};
            process.ErrorDataReceived += (_, e) => { if (e.Data != null) lock (errors) { errors.AppendLine(e.Data); if (errors.Length > 6000) errors.Remove(0, 3000); } };
            process.Start(); process.BeginErrorReadLine();
        }
        public async Task<string> Command(string command)
        {
            await gate.WaitAsync().ConfigureAwait(false);
            try
            {
                if (disposed) throw new ObjectDisposedException(nameof(KataGoClient));
                await process.StandardInput.WriteLineAsync(command).ConfigureAwait(false);
                await process.StandardInput.FlushAsync().ConfigureAwait(false);
                var read = ReadResponse();
                if (await Task.WhenAny(read, Task.Delay(90000)).ConfigureAwait(false) != read)
                {
                    Dispose(); throw new TimeoutException("KataGo 응답 시간이 초과되었습니다. 새 대국으로 다시 연결해 주세요.");
                }
                return await read.ConfigureAwait(false);
            }
            finally { gate.Release(); }
        }
        async Task<string> ReadResponse()
        {
            var text = new StringBuilder(); bool started = false;
            while (true)
            {
                string line = await process.StandardOutput.ReadLineAsync().ConfigureAwait(false);
                if (line == null) { string details; lock (errors) details = errors.ToString(); throw new IOException("KataGo 종료: " + details); }
                if (line.Length == 0) { if (started) break; continue; }
                started = true; text.AppendLine(line);
            }
            var response = text.ToString().Trim();
            if (!response.StartsWith("=")) throw new IOException("GTP 오류: " + response);
            return response.Substring(1).Trim();
        }
        public async Task Initialize(int size, string profile)
        {
            await Command("protocol_version"); await Command("boardsize " + size);
            await Command("clear_board"); await Command("kata-set-rules chinese-ogs");
            await Command("komi 7.5"); await Command("kata-set-param humanSLProfile " + profile);
        }
        public void Dispose()
        {
            if (disposed) return; disposed = true;
            try { if (!process.HasExited) process.Kill(); } catch (InvalidOperationException) { }
            // Readers may still be completing; don't dispose streams or semaphore under them.
        }
    }
}
