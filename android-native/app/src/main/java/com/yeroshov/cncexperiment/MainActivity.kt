package com.yeroshov.cncexperiment

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.EditText
import android.widget.Button
import android.text.InputType

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(42, 70, 42, 42)
            setBackgroundColor(Color.rgb(14, 20, 32))
        }
        fun label(s: String, size: Float): TextView = TextView(this).apply {
            text = s
            textSize = size
            setTextColor(Color.WHITE)
            setPadding(0, 0, 0, 28)
        }
        root.addView(label("YEROSHOV CNC", 28f))
        root.addView(label("Нативный Android · тест APK", 17f))
        root.addView(label("Расчёт оборотов шпинделя", 20f))
        fun number(hintText: String): EditText = EditText(this).apply {
            hint = hintText
            setHintTextColor(Color.LTGRAY)
            setTextColor(Color.WHITE)
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        }
        val diameter = number("Диаметр, мм")
        val speed = number("Скорость резания, м/мин")
        root.addView(diameter)
        root.addView(speed)
        val result = label("Введите параметры", 20f)
        val button = Button(this).apply {
            text = "РАССЧИТАТЬ"
            setOnClickListener {
                val d = diameter.text.toString().replace(',', '.').toDoubleOrNull()
                val v = speed.text.toString().replace(',', '.').toDoubleOrNull()
                result.text = if (d != null && v != null && d > 0 && v > 0)
                    "n = %.0f об/мин".format(java.util.Locale.US, 1000 * v / (Math.PI * d))
                else "Введите положительные значения"
            }
        }
        root.addView(button)
        root.addView(result)
        root.addView(label("Работает офлайн. Это отдельный прототип, существующий веб-проект не изменён.", 14f))
        setContentView(root)
    }
}
