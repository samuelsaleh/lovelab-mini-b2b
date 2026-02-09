export default function LoadingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '8px 0' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#ccc',
            animation: `dot 1s ${i * 0.15}s infinite ease-in-out`,
          }}
        />
      ))}
    </div>
  )
}
