package com.shamail.gpscam

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.shamail.gpscam.databinding.ActivityPhotoDetailBinding
import com.shamail.gpscam.storage.PhotoStorageManager

class PhotoDetailActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPhotoDetailBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPhotoDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val uriStr = intent.getStringExtra("photo_uri") ?: run {
            finish()
            return
        }
        val photoUri = Uri.parse(uriStr)
        val photoName = intent.getStringExtra("photo_name") ?: "SHAMAIL_GPS.jpg"
        val filePath = intent.getStringExtra("photo_path")
        val provenance = intent.getStringExtra("photo_provenance") ?: "Verified Capture Time"

        binding.tvDetailTitle.text = photoName
        binding.tvDetailMeta.text = "${PhotoStorageManager.RELATIVE_PICTURES_PATH} · $provenance"
        binding.ivFullPhoto.setImageURI(photoUri)

        binding.btnBackDetail.setOnClickListener { finish() }

        binding.btnSharePhoto.setOnClickListener {
            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "image/jpeg"
                putExtra(Intent.EXTRA_STREAM, photoUri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(shareIntent, "Share GPS Watermarked Photo"))
        }

        binding.btnDeletePhoto.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Delete Photo?")
                .setMessage("Permanently remove $photoName from ${PhotoStorageManager.RELATIVE_PICTURES_PATH}?")
                .setPositiveButton("Delete") { _, _ ->
                    val deleted = PhotoStorageManager.deletePhoto(this, photoUri, filePath)
                    if (deleted) {
                        Toast.makeText(this, "Photo deleted", Toast.LENGTH_SHORT).show()
                        finish()
                    } else {
                        Toast.makeText(this, "Unable to delete photo on this Android version", Toast.LENGTH_LONG).show()
                    }
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
    }
}
