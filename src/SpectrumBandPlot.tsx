import { memo, useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import {
  bandColor,
  detectorColumnCenterX,
  signatureBandBins,
  signatureY,
  toNumber,
} from './panelBuilderShared'
import type { DetectorInfo, NumericRow } from './panelBuilderShared'

type SpectrumBandPlotProps = {
  fluorophore: string
  row: NumericRow
  detectors: DetectorInfo[]
  chartWidth: number
  theme: 'light' | 'dark'
  eager?: boolean
}

const PLOT_LEFT = 58
const PLOT_TOP = 22
const PLOT_HEIGHT = 265
const AXIS_BOTTOM = PLOT_TOP + PLOT_HEIGHT
const PLOT_TOTAL_HEIGHT = AXIS_BOTTOM + 82

function drawSpectrum(
  canvas: HTMLCanvasElement,
  row: NumericRow,
  detectors: DetectorInfo[],
  chartWidth: number,
  theme: 'light' | 'dark',
) {
  canvas.width = chartWidth
  canvas.height = PLOT_TOTAL_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) return

  const plotWidth = chartWidth - PLOT_LEFT - 18
  const columnWidth = plotWidth / Math.max(1, detectors.length)
  const dark = theme === 'dark'
  const plotBackground = dark ? '#0b1110' : '#f8f7f3'
  const plotStroke = dark ? '#52615b' : '#c7c3ba'
  const headingColor = dark ? '#f0f3f2' : '#17201d'
  const axisColor = dark ? '#a9b7b1' : '#6d756f'
  const horizontalGrid = dark ? 'rgba(169, 183, 177, 0.16)' : 'rgba(109, 117, 111, 0.14)'
  const verticalGrid = dark ? 'rgba(169, 183, 177, 0.1)' : 'rgba(109, 117, 111, 0.09)'

  context.clearRect(0, 0, chartWidth, PLOT_TOTAL_HEIGHT)
  context.fillStyle = plotBackground
  context.strokeStyle = plotStroke
  context.lineWidth = 1
  context.fillRect(PLOT_LEFT, PLOT_TOP, plotWidth, PLOT_HEIGHT)
  context.strokeRect(PLOT_LEFT, PLOT_TOP, plotWidth, PLOT_HEIGHT)

  context.font = '11px system-ui, sans-serif'
  context.textAlign = 'right'
  context.textBaseline = 'alphabetic'
  context.fillStyle = axisColor
  for (let tick = 0; tick <= 6; tick += 1) {
    const y = signatureY(tick, PLOT_TOP, PLOT_HEIGHT)
    context.strokeStyle = horizontalGrid
    context.beginPath()
    context.moveTo(PLOT_LEFT, y)
    context.lineTo(PLOT_LEFT + plotWidth, y)
    context.stroke()
    context.fillText(`10^${tick}`, PLOT_LEFT - 9, y + 4)
  }

  context.save()
  context.translate(14, PLOT_TOP + PLOT_HEIGHT / 2)
  context.rotate(-Math.PI / 2)
  context.font = '700 13px system-ui, sans-serif'
  context.fillStyle = headingColor
  context.textAlign = 'center'
  context.fillText('Intensity', 0, 0)
  context.restore()

  detectors.forEach((detector, index) => {
    const centerX = detectorColumnCenterX(index, detectors.length, PLOT_LEFT, plotWidth)
    context.strokeStyle = verticalGrid
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(centerX, PLOT_TOP)
    context.lineTo(centerX, AXIS_BOTTOM)
    context.stroke()

    const value = toNumber(row[detector.detector])
    signatureBandBins(value).forEach((bin) => {
      const y = signatureY(bin.logValue, PLOT_TOP, PLOT_HEIGHT)
      context.globalAlpha = 0.95
      context.fillStyle = bandColor(bin.density)
      context.fillRect(
        centerX - Math.max(3, columnWidth * 0.28),
        y - 2.3,
        Math.max(4, columnWidth * 0.56),
        4.6,
      )
    })
    context.globalAlpha = 1

    context.save()
    context.translate(centerX, AXIS_BOTTOM + 12)
    context.rotate(-Math.PI / 2)
    context.font = '10px system-ui, sans-serif'
    context.fillStyle = axisColor
    context.textAlign = 'right'
    context.textBaseline = 'middle'
    context.fillText(detector.label, 0, 0)
    context.restore()
  })
}

export const SpectrumBandPlot = memo(function SpectrumBandPlot({
  fluorophore,
  row,
  detectors,
  chartWidth,
  theme,
  eager = false,
}: SpectrumBandPlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = () => drawSpectrum(canvas, row, detectors, chartWidth, theme)
    const release = () => {
      canvas.width = 1
      canvas.height = 1
    }

    if (eager || typeof IntersectionObserver === 'undefined') {
      draw()
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) draw()
      else release()
    }, { rootMargin: '700px 0px' })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [chartWidth, detectors, eager, row, theme])

  return (
    <canvas
      ref={canvasRef}
      className="signature-band-plot"
      width={1}
      height={1}
      role="img"
      aria-label={`${fluorophore} spectrum`}
      style={{ aspectRatio: `${chartWidth} / ${PLOT_TOTAL_HEIGHT}` } as CSSProperties}
    />
  )
})
