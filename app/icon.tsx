import { ImageResponse } from 'next/og'

export const size = {
  width: 48,
  height: 48,
}
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <svg
        width="48"
        height="48"
        viewBox="0 0 16 16"
        fill="none"
      >
        <circle cx="6.5" cy="6.5" r="6" fill="#000000" />
        <line
          x1="10.7"
          y1="10.7"
          x2="14.8"
          y2="14.8"
          stroke="#000000"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <path
          d="M5.189 7.206L7.804 10.121L8.007 10.234H8.629L8.758 10.103V9.056L8.666 8.841L7.081 7.037C6.682 6.589 6.376 6.178 5.792 6.066L5.866 5.813L5.477 5.860L5.124 7.000L5.189 7.206V7.206ZM7.182 4.010L3.363 4.823L3.159 4.944L2.853 5.496L2.909 5.673L3.808 6.197L4.030 6.225L6.376 5.739C6.960 5.617 7.470 5.552 7.859 5.103L8.063 5.318L8.221 4.954L7.386 4.057L7.182 4.010V4.010ZM8.953 7.327L10.158 3.589V3.346L9.843 2.804L9.658 2.767L8.758 3.290L8.619 3.468L7.868 5.757C7.683 6.328 7.479 6.804 7.674 7.374L7.386 7.440L7.618 7.757L8.805 7.486L8.953 7.327L8.953 7.327Z"
          fill="white"
        />
      </svg>
    ),
    { ...size },
  )
}
