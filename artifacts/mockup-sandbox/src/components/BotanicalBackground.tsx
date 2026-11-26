import * as React from "react";

/**
 * Ambient botanical leaf silhouettes in muted Gothos sage/forest-green tones.
 * Uses GPU-only transforms and respects `prefers-reduced-motion: reduce`.
 */
export function BotanicalBackground() {
  return (
    <div
      aria-hidden="true"
      className="botanical-bg pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
    >
      {/* Top-left eucalyptus branch */}
      <svg
        viewBox="0 0 360 320"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="botanical-sway-slow absolute -left-10 -top-8 h-64 w-72 text-[#2F6B4F] opacity-[0.14] sm:h-80 sm:w-96"
      >
        <path
          d="M-10 10 C70 55, 145 85, 250 105"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M75 55 C55 25, 25 18, 12 42 C32 62, 58 65, 75 55 Z"
          fill="currentColor"
          opacity="0.7"
        />
        <path
          d="M118 72 C132 40, 165 32, 178 55 C160 76, 134 80, 118 72 Z"
          fill="currentColor"
          opacity="0.55"
        />
        <path
          d="M148 82 C138 114, 108 130, 92 110 C108 88, 132 78, 148 82 Z"
          fill="currentColor"
          opacity="0.75"
        />
        <path
          d="M196 94 C210 62, 244 54, 258 78 C240 98, 212 102, 196 94 Z"
          fill="currentColor"
          opacity="0.6"
        />
        <path
          d="M214 98 C206 130, 178 148, 162 128 C176 106, 198 95, 214 98 Z"
          fill="currentColor"
          opacity="0.5"
        />
        <path
          d="M250 105 C272 95, 296 98, 304 114 C284 124, 262 118, 250 105 Z"
          fill="currentColor"
          opacity="0.65"
        />
        {/* Delicate secondary twig */}
        <path
          d="M42 42 C48 110, 38 175, 18 235"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.7"
        />
        <path
          d="M44 126 C72 132, 86 156, 68 168 C48 158, 40 140, 44 126 Z"
          fill="currentColor"
          opacity="0.45"
        />
        <path
          d="M36 174 C10 176, -4 198, 12 214 C32 204, 40 188, 36 174 Z"
          fill="currentColor"
          opacity="0.5"
        />
      </svg>

      {/* Top-right / center-top botanical sprig */}
      <svg
        viewBox="0 0 380 260"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="botanical-sway-medium absolute -top-6 right-4 hidden h-60 w-80 text-[#3B7658] opacity-[0.12] md:block lg:right-[14%]"
      >
        <path
          d="M360 18 C275 48, 195 72, 110 88"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M295 42 C282 14, 252 10, 240 30 C258 48, 280 50, 295 42 Z"
          fill="currentColor"
          opacity="0.65"
        />
        <path
          d="M248 56 C258 88, 232 108, 214 92 C222 70, 236 58, 248 56 Z"
          fill="currentColor"
          opacity="0.55"
        />
        <path
          d="M204 68 C192 40, 162 36, 150 56 C168 74, 190 76, 204 68 Z"
          fill="currentColor"
          opacity="0.7"
        />
        <path
          d="M162 78 C170 108, 144 126, 126 110 C136 88, 148 78, 162 78 Z"
          fill="currentColor"
          opacity="0.5"
        />
        <path
          d="M110 88 C86 80, 64 88, 58 104 C78 112, 98 104, 110 88 Z"
          fill="currentColor"
          opacity="0.6"
        />
      </svg>

      {/* Center-top subtle eucalyptus cluster near card */}
      <svg
        viewBox="0 0 280 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="botanical-drift-slow absolute left-[46%] -top-8 hidden h-64 w-64 text-[#2F6B4F] opacity-[0.11] lg:block"
      >
        <path
          d="M120 -10 C110 65, 92 135, 62 205"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <ellipse cx="92" cy="54" rx="22" ry="14" transform="rotate(-28 92 54)" fill="currentColor" opacity="0.65" />
        <ellipse cx="128" cy="84" rx="20" ry="13" transform="rotate(24 128 84)" fill="currentColor" opacity="0.5" />
        <ellipse cx="74" cy="118" rx="24" ry="14" transform="rotate(-35 74 118)" fill="currentColor" opacity="0.7" />
        <ellipse cx="106" cy="152" rx="19" ry="12" transform="rotate(20 106 152)" fill="currentColor" opacity="0.55" />
        <ellipse cx="62" cy="186" rx="18" ry="11" transform="rotate(-18 62 186)" fill="currentColor" opacity="0.6" />
      </svg>

      {/* Middle-right fern frond */}
      <svg
        viewBox="0 0 220 340"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="botanical-sway-medium absolute -right-8 top-[24%] hidden h-80 w-52 text-[#2A6247] opacity-[0.12] sm:block"
      >
        <path
          d="M210 15 C160 85, 130 165, 118 280"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path d="M188 48 C162 42, 144 52, 138 64 C158 68, 178 60, 188 48 Z" fill="currentColor" opacity="0.65" />
        <path d="M172 82 C142 76, 122 88, 116 102 C138 106, 160 96, 172 82 Z" fill="currentColor" opacity="0.7" />
        <path d="M158 118 C128 114, 108 128, 102 142 C126 144, 146 134, 158 118 Z" fill="currentColor" opacity="0.6" />
        <path d="M146 156 C116 154, 96 168, 92 182 C116 184, 136 172, 146 156 Z" fill="currentColor" opacity="0.75" />
        <path d="M136 196 C108 196, 90 210, 88 224 C110 224, 128 212, 136 196 Z" fill="currentColor" opacity="0.55" />
        <path d="M128 234 C104 236, 90 250, 90 262 C110 260, 122 248, 128 234 Z" fill="currentColor" opacity="0.5" />
      </svg>

      {/* Bottom-left botanical cluster */}
      <svg
        viewBox="0 0 320 300"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="botanical-drift-slow absolute -bottom-10 -left-10 h-60 w-64 text-[#1E5B3F] opacity-[0.13] sm:h-72 sm:w-80"
      >
        <path
          d="M15 305 C58 220, 112 155, 190 95"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M55 245 C25 225, 18 195, 38 182 C58 198, 64 224, 55 245 Z"
          fill="currentColor"
          opacity="0.7"
        />
        <path
          d="M94 198 C124 202, 144 222, 128 242 C104 236, 92 218, 94 198 Z"
          fill="currentColor"
          opacity="0.55"
        />
        <path
          d="M120 162 C92 142, 86 112, 108 100 C128 118, 132 144, 120 162 Z"
          fill="currentColor"
          opacity="0.75"
        />
        <path
          d="M152 130 C182 134, 200 154, 184 172 C160 166, 148 148, 152 130 Z"
          fill="currentColor"
          opacity="0.5"
        />
        <path
          d="M190 95 C196 68, 214 54, 228 66 C224 88, 208 98, 190 95 Z"
          fill="currentColor"
          opacity="0.65"
        />
      </svg>

      {/* Bottom-right botanical stems */}
      <svg
        viewBox="0 0 340 300"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="botanical-sway-slow absolute -bottom-8 -right-8 h-64 w-72 text-[#2F6B4F] opacity-[0.14] sm:h-80 sm:w-88"
      >
        <path
          d="M320 305 C265 215, 220 145, 168 72"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M278 238 C246 238, 226 220, 236 198 C260 202, 276 218, 278 238 Z"
          fill="currentColor"
          opacity="0.7"
        />
        <path
          d="M244 186 C272 174, 294 184, 292 206 C270 212, 250 202, 244 186 Z"
          fill="currentColor"
          opacity="0.55"
        />
        <path
          d="M214 142 C182 140, 164 120, 176 98 C200 104, 214 122, 214 142 Z"
          fill="currentColor"
          opacity="0.75"
        />
        <path
          d="M188 102 C214 90, 236 100, 234 120 C212 126, 194 116, 188 102 Z"
          fill="currentColor"
          opacity="0.6"
        />
        <path
          d="M168 72 C156 46, 162 24, 180 28 C186 48, 180 64, 168 72 Z"
          fill="currentColor"
          opacity="0.65"
        />
      </svg>
    </div>
  );
}
