package com.shamail.gpscam.watermark

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.util.AttributeSet
import android.view.View
import com.shamail.gpscam.data.GpsSnapshot
import com.shamail.gpscam.data.WatermarkConfig
import kotlin.math.ceil

class WatermarkPreviewView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var config: WatermarkConfig = WatermarkConfig()
    private var gps: GpsSnapshot = GpsSnapshot()
    private var logoBitmap: Bitmap? = null
    private var nowMillis: Long = System.currentTimeMillis()

    fun updateState(
        newConfig: WatermarkConfig,
        newGps: GpsSnapshot,
        newLogo: Bitmap?,
        currentMillis: Long = System.currentTimeMillis()
    ) {
        val layoutMayChange =
            config.showWatermark != newConfig.showWatermark ||
            config.watermarkStyle != newConfig.watermarkStyle ||
            config.showMapThumbnail != newConfig.showMapThumbnail ||
            config.watermarkSize != newConfig.watermarkSize ||
            config.fontScale != newConfig.fontScale ||
            config.showOrgHeading != newConfig.showOrgHeading ||
            config.showLocationTitle != newConfig.showLocationTitle ||
            config.showFullAddress != newConfig.showFullAddress ||
            config.showCoordinates != newConfig.showCoordinates ||
            config.showDateTime != newConfig.showDateTime ||
            config.showAccuracy != newConfig.showAccuracy ||
            config.showLogo != newConfig.showLogo

        config = newConfig
        gps = newGps
        logoBitmap = newLogo
        nowMillis = currentMillis

        if (layoutMayChange) {
            requestLayout()
        }
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val specWidth = MeasureSpec.getSize(widthMeasureSpec).coerceAtLeast(240)
        if (!config.showWatermark) {
            setMeasuredDimension(specWidth, resolveSize(0, heightMeasureSpec))
            return
        }
        val neededHeight = WatermarkRenderer.drawWatermarkOverlay(
            canvas = null,
            containerWidth = specWidth.toFloat(),
            containerHeight = 0f,
            config = config,
            gps = gps,
            logoBitmap = logoBitmap,
            nowMillis = nowMillis,
            anchorToBottom = false
        )
        val resolvedHeight = resolveSize(ceil(neededHeight).toInt().coerceAtLeast(48), heightMeasureSpec)
        setMeasuredDimension(specWidth, resolvedHeight)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (!config.showWatermark) return
        WatermarkRenderer.drawWatermarkOverlay(
            canvas = canvas,
            containerWidth = width.toFloat(),
            containerHeight = height.toFloat(),
            config = config,
            gps = gps,
            logoBitmap = logoBitmap,
            nowMillis = nowMillis,
            anchorToBottom = false
        )
    }
}
