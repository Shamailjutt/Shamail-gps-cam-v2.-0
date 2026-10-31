package com.shamail.gpscam.watermark

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import com.shamail.gpscam.R
import com.shamail.gpscam.data.GpsSnapshot
import com.shamail.gpscam.data.WatermarkConfig
import com.shamail.gpscam.data.WatermarkPosition
import com.shamail.gpscam.data.WatermarkStyle
import com.shamail.gpscam.data.WatermarkTextColor
import java.io.File
import java.util.Locale
import kotlin.math.abs

object WatermarkRenderer {

    fun loadLogoBitmap(context: Context, config: WatermarkConfig): Bitmap? {
        if (!config.showLogo) return null
        val customPath = config.customLogoPath
        if (!customPath.isNullOrBlank()) {
            val f = File(customPath)
            if (f.exists()) {
                BitmapFactory.decodeFile(f.absolutePath)?.let { return it }
            }
        }
        return runCatching {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeResource(context.resources, R.drawable.default_org_logo, bounds)
            var sample = 1
            val maxDim = maxOf(bounds.outWidth, bounds.outHeight)
            while (maxDim / sample > 384) {
                sample *= 2
            }
            val decodeOpts = BitmapFactory.Options().apply { inSampleSize = sample }
            BitmapFactory.decodeResource(context.resources, R.drawable.default_org_logo, decodeOpts)
        }.getOrNull()
    }

    fun renderOntoBitmap(
        source: Bitmap,
        config: WatermarkConfig,
        gps: GpsSnapshot,
        logoBitmap: Bitmap?,
        captureMillis: Long = System.currentTimeMillis()
    ): Bitmap {
        val output = source.copy(Bitmap.Config.ARGB_8888, true)
        if (!config.showWatermark) {
            return output
        }
        val canvas = Canvas(output)
        drawWatermarkOverlay(
            canvas = canvas,
            containerWidth = output.width.toFloat(),
            containerHeight = output.height.toFloat(),
            config = config,
            gps = gps,
            logoBitmap = logoBitmap,
            nowMillis = captureMillis,
            anchorToBottom = true
        )
        return output
    }

    fun drawWatermarkOverlay(
        canvas: Canvas?,
        containerWidth: Float,
        containerHeight: Float,
        config: WatermarkConfig,
        gps: GpsSnapshot,
        logoBitmap: Bitmap?,
        nowMillis: Long = System.currentTimeMillis(),
        anchorToBottom: Boolean = true
    ): Float {
        if (!config.showWatermark || containerWidth <= 10f) return 0f

        val outerMargin = (containerWidth * 0.025f).coerceAtLeast(8f)
        val availableWidth = (containerWidth - outerMargin * 2f).coerceAtLeast(100f)
        val widthFactor = when (config.watermarkStyle) {
            WatermarkStyle.MODERN_BANNER -> maxOf(config.watermarkSize.widthFraction, 0.94f)
            else -> config.watermarkSize.widthFraction
        }
        val cardWidth = availableWidth * widthFactor

        val unit = (cardWidth / 345f) * config.fontScale
        val pad = when (config.watermarkStyle) {
            WatermarkStyle.COMPACT_STRIP -> (9.5f * unit).coerceAtLeast(7f)
            else -> (12f * unit).coerceAtLeast(8f)
        }
        val cornerRadius = when (config.watermarkStyle) {
            WatermarkStyle.COMPACT_STRIP -> (9f * unit).coerceAtLeast(6f)
            WatermarkStyle.MODERN_BANNER -> (14f * unit).coerceAtLeast(10f)
            WatermarkStyle.CLASSIC_CARD -> (12f * unit).coerceAtLeast(8f)
        }

        val primaryColor = Color.parseColor(config.textColor.hex)
        val secondaryColor = when (config.textColor) {
            WatermarkTextColor.WHITE -> Color.parseColor("#E2E8F0")
            WatermarkTextColor.IVORY -> Color.parseColor("#FEF3C7")
            WatermarkTextColor.GOLD -> Color.parseColor("#FDE68A")
        }
        val metaColor = when (config.textColor) {
            WatermarkTextColor.WHITE -> Color.parseColor("#CBD5E1")
            WatermarkTextColor.IVORY -> Color.parseColor("#FDE68A")
            WatermarkTextColor.GOLD -> Color.parseColor("#FBBF24")
        }

        val orgPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#FBBF24")
            textSize = 11.5f * unit
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
            letterSpacing = 0.08f
        }

        val locationPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = primaryColor
            textSize = (if (config.watermarkStyle == WatermarkStyle.COMPACT_STRIP) 15.0f else 16.5f) * unit
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
        }

        val addressPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = secondaryColor
            textSize = 11.2f * unit
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
        }

        val metaPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = metaColor
            textSize = 10.5f * unit
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
        }

        val hasLogo = config.showLogo
        val logoSize = if (hasLogo) {
            (if (config.watermarkStyle == WatermarkStyle.COMPACT_STRIP) 52f * unit else 62f * unit).coerceAtLeast(40f)
        } else 0f
        val logoGap = if (hasLogo) (11f * unit) else 0f

        val hasMapThumb = config.showMapThumbnail && gps.hasFix
        val mapThumbSize = if (hasMapThumb) {
            (if (config.watermarkStyle == WatermarkStyle.COMPACT_STRIP) 54f * unit else 64f * unit).coerceAtLeast(44f)
        } else 0f
        val mapThumbGap = if (hasMapThumb) (10f * unit) else 0f

        val leftBarExtra = if (config.watermarkStyle == WatermarkStyle.COMPACT_STRIP) (5f * unit) else 0f
        val textColumnWidth = (cardWidth - pad * 2f - leftBarExtra - logoSize - logoGap - mapThumbSize - mapThumbGap)
            .toInt()
            .coerceAtLeast(80)

        var bodyContentHeight = 0f
        val lineGap = (if (config.watermarkStyle == WatermarkStyle.COMPACT_STRIP) 3f else 4f) * unit

        val orgText = config.organizationName.ifBlank { "SHAMAIL PERA" }.uppercase(Locale.US)
        val bannerHeaderHeight = if (config.watermarkStyle == WatermarkStyle.MODERN_BANNER && config.showOrgHeading) {
            (26f * unit).coerceAtLeast(22f)
        } else 0f

        val orgLayout = if (config.showOrgHeading && config.watermarkStyle != WatermarkStyle.MODERN_BANNER) {
            buildStaticLayout(orgText, orgPaint, textColumnWidth, 1)
        } else null
        if (orgLayout != null) {
            bodyContentHeight += orgLayout.height + lineGap
        }

        val locationLayout = if (config.showLocationTitle) {
            buildStaticLayout(gps.buildLocationHeadline(), locationPaint, textColumnWidth, 2)
        } else null
        if (locationLayout != null) {
            bodyContentHeight += locationLayout.height + lineGap
        }

        val addressLayout = if (config.showFullAddress) {
            buildStaticLayout(gps.buildFullAddressLine(), addressPaint, textColumnWidth, 2)
        } else null
        if (addressLayout != null) {
            bodyContentHeight += addressLayout.height + lineGap * 1.2f
        }

        val coordLayout = if (config.showCoordinates) {
            buildStaticLayout(config.formatCoordinates(gps), metaPaint, textColumnWidth, 1)
        } else null
        if (coordLayout != null) {
            bodyContentHeight += coordLayout.height + lineGap * 0.8f
        }

        val bottomMetaParts = mutableListOf<String>()
        if (config.showDateTime) {
            bottomMetaParts.add(config.formatTimestamp(gps, nowMillis))
        }
        if (config.showAccuracy && gps.hasFix && gps.accuracyMeters > 0f) {
            bottomMetaParts.add(String.format(Locale.US, "Acc: ±%.1f m", gps.accuracyMeters))
        }
        val bottomMetaText = bottomMetaParts.joinToString("  •  ")
        val bottomMetaLayout = if (bottomMetaText.isNotEmpty()) {
            buildStaticLayout(bottomMetaText, metaPaint, textColumnWidth, 2)
        } else null
        if (bottomMetaLayout != null) {
            bodyContentHeight += bottomMetaLayout.height
        }

        val innerBodyHeight = maxOf(bodyContentHeight, logoSize, mapThumbSize).coerceAtLeast(34f)
        val cardHeight = bannerHeaderHeight + innerBodyHeight + pad * 2f

        if (canvas == null) {
            return cardHeight + if (anchorToBottom) outerMargin * 2f else 0f
        }

        val cardLeft = when (config.watermarkPosition) {
            WatermarkPosition.BOTTOM_LEFT -> outerMargin
            WatermarkPosition.BOTTOM_CENTER -> (containerWidth - cardWidth) / 2f
            WatermarkPosition.BOTTOM_RIGHT -> containerWidth - outerMargin - cardWidth
        }
        val cardTop = if (anchorToBottom) {
            (containerHeight - outerMargin - cardHeight).coerceAtLeast(0f)
        } else {
            0f
        }
        val cardRect = RectF(cardLeft, cardTop, cardLeft + cardWidth, cardTop + cardHeight)

        val alphaInt = ((config.watermarkOpacity.coerceIn(30, 95) / 100f) * 255f).toInt()
        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(alphaInt, 9, 11, 15)
            style = Paint.Style.FILL
        }
        canvas.drawRoundRect(cardRect, cornerRadius, cornerRadius, bgPaint)

        // Style-specific accents
        when (config.watermarkStyle) {
            WatermarkStyle.CLASSIC_CARD -> {
                val accentRect = RectF(
                    cardRect.left + pad,
                    cardRect.top,
                    cardRect.left + pad + (56f * unit),
                    cardRect.top + (2.8f * unit).coerceAtLeast(2f)
                )
                val goldBarPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.parseColor("#F59E0B")
                    style = Paint.Style.FILL
                }
                canvas.drawRoundRect(accentRect, 2f, 2f, goldBarPaint)
            }
            WatermarkStyle.COMPACT_STRIP -> {
                val stripRect = RectF(
                    cardRect.left + (4f * unit),
                    cardRect.top + (7f * unit),
                    cardRect.left + (7.5f * unit),
                    cardRect.bottom - (7f * unit)
                )
                val stripPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.parseColor("#F59E0B")
                    style = Paint.Style.FILL
                }
                canvas.drawRoundRect(stripRect, 3f, 3f, stripPaint)
            }
            WatermarkStyle.MODERN_BANNER -> {
                if (bannerHeaderHeight > 0f) {
                    canvas.save()
                    val clipBanner = Path().apply {
                        addRoundRect(cardRect, cornerRadius, cornerRadius, Path.Direction.CW)
                    }
                    canvas.clipPath(clipBanner)
                    val headerRect = RectF(
                        cardRect.left,
                        cardRect.top,
                        cardRect.right,
                        cardRect.top + bannerHeaderHeight
                    )
                    val headerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        color = Color.argb((alphaInt + 24).coerceAtMost(245), 22, 26, 36)
                        style = Paint.Style.FILL
                    }
                    canvas.drawRect(headerRect, headerPaint)
                    val dividerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        color = Color.argb(130, 245, 158, 11)
                        strokeWidth = (1.1f * unit).coerceAtLeast(1f)
                    }
                    canvas.drawLine(
                        headerRect.left,
                        headerRect.bottom,
                        headerRect.right,
                        headerRect.bottom,
                        dividerPaint
                    )
                    val bannerOrgLayout = buildStaticLayout(
                        orgText,
                        orgPaint,
                        (cardWidth - pad * 2f).toInt().coerceAtLeast(80),
                        1
                    )
                    canvas.translate(
                        cardRect.left + pad,
                        cardRect.top + (bannerHeaderHeight - bannerOrgLayout.height) / 2f
                    )
                    bannerOrgLayout.draw(canvas)
                    canvas.restore()
                }
            }
        }

        val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(92, 251, 191, 36)
            style = Paint.Style.STROKE
            strokeWidth = (1.15f * unit).coerceAtLeast(1f)
        }
        canvas.drawRoundRect(cardRect, cornerRadius, cornerRadius, borderPaint)

        val bodyTop = cardRect.top + bannerHeaderHeight + pad
        var textStartX = cardRect.left + pad + leftBarExtra

        if (hasLogo) {
            val logoTop = bodyTop + (innerBodyHeight - logoSize) / 2f
            val logoRect = RectF(textStartX, logoTop, textStartX + logoSize, logoTop + logoSize)
            drawCircularLogoBadge(canvas, logoRect, logoBitmap, unit)
            textStartX += logoSize + logoGap
        }

        if (hasMapThumb) {
            val mapLeft = cardRect.right - pad - mapThumbSize
            val mapTop = bodyTop + (innerBodyHeight - mapThumbSize) / 2f
            val mapRect = RectF(mapLeft, mapTop, mapLeft + mapThumbSize, mapTop + mapThumbSize)
            drawTacticalMapThumbnail(canvas, mapRect, gps, unit)
        }

        var cursorY = bodyTop + ((innerBodyHeight - bodyContentHeight).coerceAtLeast(0f) / 2f)
        if (orgLayout != null) {
            canvas.save()
            canvas.translate(textStartX, cursorY)
            orgLayout.draw(canvas)
            canvas.restore()
            cursorY += orgLayout.height + lineGap
        }

        if (locationLayout != null) {
            canvas.save()
            canvas.translate(textStartX, cursorY)
            locationLayout.draw(canvas)
            canvas.restore()
            cursorY += locationLayout.height + lineGap
        }

        if (addressLayout != null) {
            canvas.save()
            canvas.translate(textStartX, cursorY)
            addressLayout.draw(canvas)
            canvas.restore()
            cursorY += addressLayout.height + lineGap * 1.2f
        }

        if (coordLayout != null) {
            canvas.save()
            canvas.translate(textStartX, cursorY)
            coordLayout.draw(canvas)
            canvas.restore()
            cursorY += coordLayout.height + lineGap * 0.8f
        }

        if (bottomMetaLayout != null) {
            canvas.save()
            canvas.translate(textStartX, cursorY)
            bottomMetaLayout.draw(canvas)
            canvas.restore()
        }

        return cardHeight
    }

    private fun drawCircularLogoBadge(canvas: Canvas, rect: RectF, logoBitmap: Bitmap?, unit: Float) {
        val cx = rect.centerX()
        val cy = rect.centerY()
        val radius = rect.width() / 2f

        val circleBg = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#07080B")
            style = Paint.Style.FILL
        }
        canvas.drawCircle(cx, cy, radius, circleBg)

        if (logoBitmap != null && !logoBitmap.isRecycled) {
            canvas.save()
            val clipPath = Path().apply {
                addCircle(cx, cy, radius, Path.Direction.CW)
            }
            canvas.clipPath(clipPath)
            canvas.drawBitmap(logoBitmap, null, rect, Paint(Paint.FILTER_BITMAP_FLAG))
            canvas.restore()
        }

        val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(195, 245, 158, 11)
            style = Paint.Style.STROKE
            strokeWidth = (1.4f * unit).coerceAtLeast(1f)
        }
        canvas.drawCircle(cx, cy, radius, ringPaint)
    }

    private fun drawTacticalMapThumbnail(canvas: Canvas, rect: RectF, gps: GpsSnapshot, unit: Float) {
        val r = (8f * unit).coerceAtLeast(5f)
        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#111622")
            style = Paint.Style.FILL
        }
        canvas.drawRoundRect(rect, r, r, bgPaint)

        canvas.save()
        val clip = Path().apply { addRoundRect(rect, r, r, Path.Direction.CW) }
        canvas.clipPath(clip)

        val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(45, 148, 163, 184)
            strokeWidth = (0.8f * unit).coerceAtLeast(0.8f)
        }
        val step = rect.width() / 4f
        for (i in 1..3) {
            canvas.drawLine(rect.left + step * i, rect.top, rect.left + step * i, rect.bottom, gridPaint)
            canvas.drawLine(rect.left, rect.top + step * i, rect.right, rect.top + step * i, gridPaint)
        }

        val seedOffset = (((abs(gps.latitude * 1000).toInt() + abs(gps.longitude * 1000).toInt()) % 24) - 12) / 40f
        val roadPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(95, 245, 158, 11)
            strokeWidth = (2.1f * unit).coerceAtLeast(1.4f)
            style = Paint.Style.STROKE
        }
        canvas.drawLine(
            rect.left,
            rect.centerY() + rect.height() * seedOffset,
            rect.right,
            rect.centerY() - rect.height() * seedOffset,
            roadPaint
        )
        canvas.drawLine(
            rect.centerX() - rect.width() * seedOffset,
            rect.top,
            rect.centerX() + rect.width() * seedOffset,
            rect.bottom,
            roadPaint
        )

        val cx = rect.centerX()
        val cy = rect.centerY()
        val haloPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(65, 251, 191, 36)
            style = Paint.Style.FILL
        }
        canvas.drawCircle(cx, cy, 9.5f * unit, haloPaint)

        val pinPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#F59E0B")
            style = Paint.Style.FILL
        }
        canvas.drawCircle(cx, cy - 2f * unit, 4.5f * unit, pinPaint)
        val pinPath = Path().apply {
            moveTo(cx - 3.8f * unit, cy - 0.5f * unit)
            lineTo(cx + 3.8f * unit, cy - 0.5f * unit)
            lineTo(cx, cy + 6.5f * unit)
            close()
        }
        canvas.drawPath(pinPath, pinPaint)

        val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#07080B")
            style = Paint.Style.FILL
        }
        canvas.drawCircle(cx, cy - 2f * unit, 1.7f * unit, dotPaint)
        canvas.restore()

        val framePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(145, 245, 158, 11)
            style = Paint.Style.STROKE
            strokeWidth = (1.1f * unit).coerceAtLeast(1f)
        }
        canvas.drawRoundRect(rect, r, r, framePaint)
    }

    private fun buildStaticLayout(
        text: String,
        paint: TextPaint,
        width: Int,
        maxLines: Int
    ): StaticLayout {
        return StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
            .setAlignment(Layout.Alignment.ALIGN_NORMAL)
            .setLineSpacing(0f, 1.08f)
            .setIncludePad(false)
            .setMaxLines(maxLines)
            .setEllipsize(android.text.TextUtils.TruncateAt.END)
            .build()
    }
}
