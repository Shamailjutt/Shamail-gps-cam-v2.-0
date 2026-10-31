package com.shamail.gpscam.ui

import androidx.fragment.app.FragmentActivity
import androidx.fragment.app.FragmentManager
import com.google.android.material.datepicker.MaterialDatePicker
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.timepicker.MaterialTimePicker
import com.google.android.material.timepicker.TimeFormat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Implements the strict 5-step sequential Date & Time Picker workflow:
 * 1. Open Material Calendar first
 * 2. User selects date
 * 3. Automatically open Material Clock (12-hour with AM/PM by default, or 24-hour without AM/PM)
 * 4. User selects hours & minutes (and AM/PM in 12h mode)
 * 5. Show Confirmation Dialog before applying
 */
object SequentialDateTimePicker {

    fun launch(
        activity: FragmentActivity,
        fragmentManager: FragmentManager = activity.supportFragmentManager,
        initialMillis: Long,
        is24HourFormat: Boolean,
        dateFormatPattern: String = "dd MMM yyyy",
        onConfirmed: (Long) -> Unit
    ) {
        val localInit = Calendar.getInstance().apply { timeInMillis = initialMillis }
        val utcSelection = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
            clear()
            set(
                localInit.get(Calendar.YEAR),
                localInit.get(Calendar.MONTH),
                localInit.get(Calendar.DAY_OF_MONTH)
            )
        }.timeInMillis

        val datePicker = MaterialDatePicker.Builder.datePicker()
            .setTitleText("Step 1 of 3 · Select Date")
            .setSelection(utcSelection)
            .build()

        datePicker.addOnPositiveButtonClickListener { selectedUtcMillis ->
            val utcCal = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
                timeInMillis = selectedUtcMillis
            }
            val mergedCal = Calendar.getInstance().apply {
                timeInMillis = initialMillis
                set(Calendar.YEAR, utcCal.get(Calendar.YEAR))
                set(Calendar.MONTH, utcCal.get(Calendar.MONTH))
                set(Calendar.DAY_OF_MONTH, utcCal.get(Calendar.DAY_OF_MONTH))
            }

            openClockStep(
                activity = activity,
                fragmentManager = fragmentManager,
                baseCal = mergedCal,
                is24HourFormat = is24HourFormat,
                dateFormatPattern = dateFormatPattern,
                onConfirmed = onConfirmed
            )
        }

        datePicker.show(fragmentManager, "SequentialStep1Calendar")
    }

    fun launchTimeOnlyWithConfirm(
        activity: FragmentActivity,
        fragmentManager: FragmentManager = activity.supportFragmentManager,
        initialMillis: Long,
        is24HourFormat: Boolean,
        dateFormatPattern: String = "dd MMM yyyy",
        onConfirmed: (Long) -> Unit
    ) {
        val baseCal = Calendar.getInstance().apply { timeInMillis = initialMillis }
        openClockStep(
            activity = activity,
            fragmentManager = fragmentManager,
            baseCal = baseCal,
            is24HourFormat = is24HourFormat,
            dateFormatPattern = dateFormatPattern,
            onConfirmed = onConfirmed
        )
    }

    private fun openClockStep(
        activity: FragmentActivity,
        fragmentManager: FragmentManager,
        baseCal: Calendar,
        is24HourFormat: Boolean,
        dateFormatPattern: String,
        onConfirmed: (Long) -> Unit
    ) {
        val timeFormat = if (is24HourFormat) TimeFormat.CLOCK_24H else TimeFormat.CLOCK_12H
        val subtitle = if (is24HourFormat) {
            "Step 2 of 3 · Select Time (24-Hour)"
        } else {
            "Step 2 of 3 · Select Time & AM/PM"
        }

        val timePicker = MaterialTimePicker.Builder()
            .setTitleText(subtitle)
            .setTimeFormat(timeFormat)
            .setHour(baseCal.get(Calendar.HOUR_OF_DAY))
            .setMinute(baseCal.get(Calendar.MINUTE))
            .build()

        timePicker.addOnPositiveButtonClickListener {
            baseCal.set(Calendar.HOUR_OF_DAY, timePicker.hour)
            baseCal.set(Calendar.MINUTE, timePicker.minute)
            baseCal.set(Calendar.SECOND, 0)
            val candidateMillis = baseCal.timeInMillis

            val timePattern = if (is24HourFormat) "HH:mm:ss" else "hh:mm:ss a"
            val formattedPreview = runCatching {
                SimpleDateFormat("$dateFormatPattern, $timePattern", Locale.US)
                    .format(Date(candidateMillis))
            }.getOrElse {
                SimpleDateFormat("dd MMM yyyy, hh:mm:ss a", Locale.US)
                    .format(Date(candidateMillis))
            }

            MaterialAlertDialogBuilder(activity)
                .setTitle("Step 3 of 3 · Confirm Date & Time")
                .setMessage(
                    "Apply this timestamp cleanly to the watermark?\n\n$formattedPreview"
                )
                .setPositiveButton("Confirm & Apply") { _, _ ->
                    onConfirmed(candidateMillis)
                }
                .setNeutralButton("Change Again") { _, _ ->
                    launch(
                        activity = activity,
                        fragmentManager = fragmentManager,
                        initialMillis = candidateMillis,
                        is24HourFormat = is24HourFormat,
                        dateFormatPattern = dateFormatPattern,
                        onConfirmed = onConfirmed
                    )
                }
                .setNegativeButton("Cancel", null)
                .show()
        }

        timePicker.show(fragmentManager, "SequentialStep2Clock")
    }
}
