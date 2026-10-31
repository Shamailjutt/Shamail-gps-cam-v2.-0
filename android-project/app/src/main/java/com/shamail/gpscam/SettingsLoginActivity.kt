package com.shamail.gpscam

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import androidx.appcompat.app.AppCompatActivity
import com.shamail.gpscam.data.AuthManager
import com.shamail.gpscam.databinding.ActivitySettingsLoginBinding

class SettingsLoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySettingsLoginBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (AuthManager.isRememberedSessionActive(this)) {
            startActivity(Intent(this, SettingsActivity::class.java))
            finish()
            return
        }

        binding = ActivitySettingsLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnBackLogin.setOnClickListener {
            finish()
        }

        binding.etPassword.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                attemptLogin()
                true
            } else {
                false
            }
        }

        binding.btnSignInSettings.setOnClickListener {
            attemptLogin()
        }
    }

    private fun attemptLogin() {
        val username = binding.etUsername.text?.toString().orEmpty()
        val password = binding.etPassword.text?.toString().orEmpty()
        val rememberUser = binding.cbRememberUser.isChecked

        if (username.isBlank() || password.isEmpty()) {
            binding.tvLoginError.text = "Please enter both username and password."
            binding.tvLoginError.visibility = View.VISIBLE
            return
        }

        val ok = AuthManager.authenticate(
            context = this,
            usernameInput = username,
            passwordInput = password,
            rememberUser = rememberUser
        )

        if (ok) {
            binding.tvLoginError.visibility = View.GONE
            binding.etPassword.setText("")
            startActivity(Intent(this, SettingsActivity::class.java))
            finish()
        } else {
            binding.etPassword.setText("")
            binding.tvLoginError.text = "Incorrect username or password. Access denied."
            binding.tvLoginError.visibility = View.VISIBLE
        }
    }
}
