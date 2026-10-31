package com.shamail.gpscam

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.shamail.gpscam.data.SavedPhotoItem
import com.shamail.gpscam.databinding.ActivityGalleryBinding
import com.shamail.gpscam.databinding.ItemGalleryPhotoBinding
import com.shamail.gpscam.storage.PhotoStorageManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class GalleryActivity : AppCompatActivity() {

    private lateinit var binding: ActivityGalleryBinding
    private val photos = mutableListOf<SavedPhotoItem>()
    private lateinit var adapter: PhotoGridAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityGalleryBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnBack.setOnClickListener { finish() }

        adapter = PhotoGridAdapter(photos) { clicked ->
            val intent = Intent(this, PhotoDetailActivity::class.java).apply {
                putExtra("photo_uri", clicked.uri.toString())
                putExtra("photo_name", clicked.displayName)
                putExtra("photo_path", clicked.filePath)
                putExtra("photo_provenance", clicked.timestampProvenance)
            }
            startActivity(intent)
        }

        binding.rvPhotos.layoutManager = GridLayoutManager(this, 2)
        binding.rvPhotos.adapter = adapter
    }

    override fun onResume() {
        super.onResume()
        loadGalleryItems()
    }

    private fun loadGalleryItems() {
        lifecycleScope.launch(Dispatchers.IO) {
            val loaded = PhotoStorageManager.listSavedPhotos(this@GalleryActivity)
            withContext(Dispatchers.Main) {
                photos.clear()
                photos.addAll(loaded)
                adapter.notifyDataSetChanged()
                binding.tvGallerySubtitle.text =
                    "${PhotoStorageManager.RELATIVE_PICTURES_PATH} · ${loaded.size} photo(s)"
                binding.emptyGalleryView.visibility = if (loaded.isEmpty()) View.VISIBLE else View.GONE
                binding.rvPhotos.visibility = if (loaded.isEmpty()) View.GONE else View.VISIBLE
            }
        }
    }

    private class PhotoGridAdapter(
        private val items: List<SavedPhotoItem>,
        private val onClick: (SavedPhotoItem) -> Unit
    ) : RecyclerView.Adapter<PhotoGridAdapter.PhotoVH>() {

        class PhotoVH(val binding: ItemGalleryPhotoBinding) : RecyclerView.ViewHolder(binding.root)

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PhotoVH {
            val b = ItemGalleryPhotoBinding.inflate(
                LayoutInflater.from(parent.context),
                parent,
                false
            )
            return PhotoVH(b)
        }

        override fun onBindViewHolder(holder: PhotoVH, position: Int) {
            val item = items[position]
            holder.binding.tvPhotoName.text = item.displayName
            holder.binding.tvTimestampBadge.text = item.timestampProvenance
            holder.binding.ivPhoto.setImageURI(item.uri)
            holder.binding.root.setOnClickListener { onClick(item) }
        }

        override fun getItemCount(): Int = items.size
    }
}
