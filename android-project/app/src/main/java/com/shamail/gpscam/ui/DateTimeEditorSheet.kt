package com.shamail.gpscam.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.shamail.gpscam.R
import com.shamail.gpscam.data.AppPreferences
import com.shamail.gpscam.data.GpsSnapshot
import com.shamail.gpscam.data.TimestampMode
import com.shamail.gpscam.data.WatermarkConfig
import com.shamail.gpscam.databinding.SheetDateTimeEditorBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class DateTimeEditorSheet(
    private val currentGps: GpsSnapshot,
    private val onConfigUpdated: (WatermarkConfig) -> Unit
) : BottomSheetDialogFragment() {

    private var _binding: SheetDateTimeEditorBinding? = null
    private val binding get() = _binding!!

    private lateinit var prefs: AppPreferences
    private lateinit var workingConfig: WatermarkConfig

    private val isoDateFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false }
    private val isoTime24Fmt = SimpleDateFormat("HH:mm:ss", Locale.US).apply { isLenient = false }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = SheetDateTimeEditorBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        prefs = AppPreferences(requireContext())
        workingConfig = prefs.loadConfig()

        when (workingConfig.timestampMode) {
            TimestampMode.AUTO_DEVICE -> binding.rbModeAuto.isChecked = true
            TimestampMode.GPS_FIX -> binding.rbModeGps.isChecked = true
            TimestampMode.MANUAL -> binding.rbModeManual.isChecked = true
        }

        binding.switch24Hour.isChecked = workingConfig.is24HourFormat
        syncEditableFieldsFromMillis(workingConfig.manualTimestampMillis)
        refreshUiVisibilityAndPreview()

        binding.rgTimestampMode.setOnCheckedChangeListener { _, checkedId ->
            val selectedMode = when (checkedId) {
                R.id.rbModeGps -> TimestampMode.GPS_FIX
                R.id.rbModeManual -> TimestampMode.MANUAL
                else -> TimestampMode.AUTO_DEVICE
            }
            workingConfig = workingConfig.copy(timestampMode = selectedMode)
            refreshUiVisibilityAndPreview()
        }

        binding.switch24Hour.setOnCheckedChangeListener { _, isChecked ->
            workingConfig = workingConfig.copy(is24HourFormat = isChecked)
            refreshUiVisibilityAndPreview()
        }

        binding.btnSequentialPicker.setOnClickListener {
            launchSequentialFlow()
        }

        binding.btnPickDate.setOnClickListener {
            launchSequentialFlow()
        }

        binding.btnPickTime.setOnClickListener {
            SequentialDateTimePicker.launchTimeOnlyWithConfirm(
                activity = requireActivity(),
                fragmentManager = parentFragmentManager,
                initialMillis = workingConfig.manualTimestampMillis,
                is24HourFormat = workingConfig.is24HourFormat,
                dateFormatPattern = workingConfig.dateFormatPattern
            ) { confirmedMillis ->
                applyConfirmedMillis(confirmedMillis)
            }
        }

        binding.btnApplyTyped.setOnClickListener {
            applyTypedDateTimeFields()
        }

        binding.btnResetNow.setOnClickListener {
            val now = System.currentTimeMillis()
            workingConfig = workingConfig.copy(
                timestampMode = TimestampMode.AUTO_DEVICE,
                manualTimestampMillis = now
            )
            binding.rbModeAuto.isChecked = true
            syncEditableFieldsFromMillis(now)
            refreshUiVisibilityAndPreview()
            Toast.makeText(requireContext(), "Reset to current device date & time", Toast.LENGTH_SHORT).show()
        }

        binding.btnSaveTimestamp.setOnClickListener {
            if (workingConfig.timestampMode == TimestampMode.MANUAL) {
                tryParseTypedMillis()?.let { parsed ->
                    workingConfig = workingConfig.copy(manualTimestampMillis = parsed)
                }
            }
            prefs.saveConfig(workingConfig)
            onConfigUpdated(workingConfig)
            dismiss()
        }
    }

    private fun launchSequentialFlow() {
        SequentialDateTimePicker.launch(
            activity = requireActivity(),
            fragmentManager = parentFragmentManager,
            initialMillis = workingConfig.manualTimestampMillis,
            is24HourFormat = workingConfig.is24HourFormat,
            dateFormatPattern = workingConfig.dateFormatPattern
        ) { confirmedMillis ->
            applyConfirmedMillis(confirmedMillis)
        }
    }

    private fun applyConfirmedMillis(confirmedMillis: Long) {
        if (_binding == null) return
        workingConfig = workingConfig.copy(
            timestampMode = TimestampMode.MANUAL,
            manualTimestampMillis = confirmedMillis
        )
        binding.rbModeManual.isChecked = true
        syncEditableFieldsFromMillis(confirmedMillis)
        refreshUiVisibilityAndPreview()
        Toast.makeText(requireContext(), "Custom date & time confirmed", Toast.LENGTH_SHORT).show()
    }

    private fun applyTypedDateTimeFields() {
        val parsed = tryParseTypedMillis()
        if (parsed == null) {
            Toast.makeText(
                requireContext(),
                "Enter date as YYYY-MM-DD and time as HH:MM:SS (or HH:MM)",
                Toast.LENGTH_SHORT
            ).show()
            return
        }
        workingConfig = workingConfig.copy(
            timestampMode = TimestampMode.MANUAL,
            manualTimestampMillis = parsed
        )
        binding.rbModeManual.isChecked = true
        syncEditableFieldsFromMillis(parsed)
        refreshUiVisibilityAndPreview()
        Toast.makeText(requireContext(), "Custom timestamp updated", Toast.LENGTH_SHORT).show()
    }

    private fun tryParseTypedMillis(): Long? {
        val rawDate = binding.etManualDate.text?.toString()?.trim().orEmpty()
        var rawTime = binding.etManualTime.text?.toString()?.trim().orEmpty()
        if (rawDate.isEmpty() || rawTime.isEmpty()) return null
        if (rawTime.count { it == ':' } == 1) {
            rawTime = "$rawTime:00"
        }
        return try {
            val combined = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).apply {
                isLenient = false
            }
            combined.parse("$rawDate $rawTime")?.time
        } catch (_: Exception) {
            null
        }
    }

    private fun syncEditableFieldsFromMillis(millis: Long) {
        val dateObj = Date(millis)
        binding.etManualDate.setText(isoDateFmt.format(dateObj))
        binding.etManualTime.setText(isoTime24Fmt.format(dateObj))
    }

    private fun refreshUiVisibilityAndPreview() {
        val isManual = workingConfig.timestampMode == TimestampMode.MANUAL
        binding.tvEditedNotice.visibility = if (isManual) View.VISIBLE else View.GONE
        binding.manualControlsGroup.alpha = if (isManual) 1.0f else 0.84f
        val formatted = workingConfig.formatTimestamp(currentGps, System.currentTimeMillis())
        binding.tvLivePreviewTimestamp.text = "Watermark Output: $formatted"
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
