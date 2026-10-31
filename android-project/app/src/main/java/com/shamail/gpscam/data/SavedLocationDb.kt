package com.shamail.gpscam.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Update

@Entity(tableName = "saved_locations")
data class SavedLocationEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    val label: String,
    val locationTitle: String,
    val fullAddress: String,
    val latitude: Double,
    val longitude: Double,
    val createdAtMillis: Long = System.currentTimeMillis()
) {
    fun toGpsSnapshot(): GpsSnapshot {
        return GpsSnapshot(
            hasFix = true,
            latitude = latitude,
            longitude = longitude,
            accuracyMeters = 0f,
            gpsTimestampMillis = System.currentTimeMillis(),
            city = locationTitle,
            streetAddress = fullAddress,
            isOfflineAddress = false,
            locationSource = LocationSource.SAVED_LOCATION
        )
    }
}

@Dao
interface SavedLocationDao {
    @Query("SELECT * FROM saved_locations ORDER BY createdAtMillis DESC")
    fun getAll(): List<SavedLocationEntity>

    @Query(
        "SELECT * FROM saved_locations " +
            "WHERE label LIKE '%' || :query || '%' " +
            "OR locationTitle LIKE '%' || :query || '%' " +
            "OR fullAddress LIKE '%' || :query || '%' " +
            "ORDER BY createdAtMillis DESC"
    )
    fun search(query: String): List<SavedLocationEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun insert(entity: SavedLocationEntity): Long

    @Update
    fun update(entity: SavedLocationEntity)

    @Query("UPDATE saved_locations SET label = :newLabel WHERE id = :id")
    fun rename(id: Long, newLabel: String)

    @Query("DELETE FROM saved_locations WHERE id = :id")
    fun deleteById(id: Long)
}

@Database(entities = [SavedLocationEntity::class], version = 1, exportSchema = false)
abstract class SavedLocationDatabase : RoomDatabase() {
    abstract fun savedLocationDao(): SavedLocationDao

    companion object {
        @Volatile
        private var INSTANCE: SavedLocationDatabase? = null

        fun getInstance(context: Context): SavedLocationDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    SavedLocationDatabase::class.java,
                    "shamail_saved_locations.db"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { INSTANCE = it }
            }
        }
    }
}
