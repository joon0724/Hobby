using System;
using System.Globalization;

namespace Baduk
{
    // KataGo whiteOwnership is row-major from A{size} to the bottom right:
    // -1 = black, +1 = white. It predicts final ownership, not settled territory.
    public sealed class TerritoryEstimate
    {
        public const float Threshold = 0.5f;
        readonly float[] values;
        public int Size { get; }
        TerritoryEstimate(int size, float[] ownership) { Size = size; values = ownership; }
        public static TerritoryEstimate Parse(string response, int size)
        {
            if (size < 2 || size > 19) throw new ArgumentOutOfRangeException(nameof(size));
            string[] tokens = response.Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
            int start = Array.IndexOf(tokens, "whiteOwnership") + 1;
            int count = size * size;
            if (start == 0 || tokens.Length - start < count) throw new FormatException("영역 분석 데이터가 부족합니다.");
            var ownership = new float[count];
            for (int p = 0; p < count; p++)
            {
                if (!float.TryParse(tokens[start + p], NumberStyles.Float, CultureInfo.InvariantCulture, out float value)
                    || float.IsNaN(value) || float.IsInfinity(value) || value < -1 || value > 1)
                    throw new FormatException("영역 분석 값이 올바르지 않습니다.");
                ownership[p] = value;
            }
            return new TerritoryEstimate(size, ownership);
        }
        public Stone OwnerAt(GoGame game, int point)
        {
            if (game.Size != Size || point < 0 || point >= values.Length || game[point] != Stone.Empty) return Stone.Empty;
            return values[point] >= Threshold ? Stone.White : values[point] <= -Threshold ? Stone.Black : Stone.Empty;
        }
        public int CountFor(GoGame game, Stone color)
        {
            if (color == Stone.Empty) return 0;
            int count = 0;
            for (int p = 0; p < values.Length; p++) if (OwnerAt(game, p) == color) count++;
            return count;
        }
    }
}
