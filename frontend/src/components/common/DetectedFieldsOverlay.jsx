import { useEffect, useRef, useState } from 'react'
import { API_URL } from '../../utils/constants'

// Distinct colour per detector class — visual proof that a real model located each field.
const CLASS_COLORS = {
  COMPANY: '#2563eb', ADDRESS: '#0891b2', DATE: '#7c3aed', TOTAL: '#dc2626',
  TAX: '#db2777', ITEM: '#16a34a', QTY: '#ca8a04', UNIT_PRICE: '#9333ea',
  LINE_TOTAL: '#059669', DOCUMENT_NO: '#475569', CASHIER: '#64748b', OTHER: '#94a3b8',
}
const colorFor = (cls) => CLASS_COLORS[cls] || '#94a3b8'

/**
 * Draws the custom YOLO field-detector's bounding boxes on top of the original receipt image.
 * `fields` are {cls, bbox:[x1,y1,x2,y2], text, conf} in ORIGINAL image-pixel coordinates, so we
 * scale them to the rendered <img> size (recomputed on load + window resize).
 */
function DetectedFieldsOverlay({ jobId, fields = [] }) {
  const imgRef = useRef(null)
  const [scale, setScale] = useState(null) // { x, y }
  const [hidden, setHidden] = useState(false)

  const measure = () => {
    const img = imgRef.current
    if (!img || !img.naturalWidth) return
    setScale({ x: img.clientWidth / img.naturalWidth, y: img.clientHeight / img.naturalHeight })
  }

  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Nothing to show (PDF upload / image missing / no detections)
  if (hidden || !fields.length) return null

  const classes = [...new Set(fields.map((f) => f.cls))]

  return (
    <div>
      <div className="relative inline-block max-w-full">
        <img
          ref={imgRef}
          src={`${API_URL}/document/${jobId}/image`}
          alt="Detected receipt"
          onLoad={measure}
          onError={() => setHidden(true)}
          className="block max-w-full h-auto rounded-lg"
        />
        {scale &&
          fields.map((f, i) => {
            const [x1, y1, x2, y2] = f.bbox
            const color = colorFor(f.cls)
            return (
              <div
                key={i}
                title={`${f.cls} · ${Math.round((f.conf || 0) * 100)}% · ${f.text || ''}`}
                className="absolute pointer-events-none"
                style={{
                  left: x1 * scale.x,
                  top: y1 * scale.y,
                  width: (x2 - x1) * scale.x,
                  height: (y2 - y1) * scale.y,
                  border: `2px solid ${color}`,
                  borderRadius: 2,
                }}
              >
                <span
                  className="absolute whitespace-nowrap text-white"
                  style={{
                    top: -14, left: -2, fontSize: 9, lineHeight: '13px',
                    background: color, padding: '0 3px', borderRadius: 2,
                  }}
                >
                  {f.cls} {Math.round((f.conf || 0) * 100)}%
                </span>
              </div>
            )
          })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {classes.map((cls) => (
          <span key={cls} className="inline-flex items-center text-xs text-gray-600">
            <span
              className="w-3 h-3 rounded-sm mr-1 inline-block"
              style={{ background: colorFor(cls) }}
            />
            {cls}
          </span>
        ))}
      </div>
    </div>
  )
}

export default DetectedFieldsOverlay
