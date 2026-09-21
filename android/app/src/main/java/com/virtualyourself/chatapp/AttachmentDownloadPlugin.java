package com.virtualyourself.chatapp;

import android.Manifest;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.OutputStream;

@CapacitorPlugin(
    name = "AttachmentDownload",
    permissions = { @Permission(alias = "downloads", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }) }
)
public class AttachmentDownloadPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("downloads") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("downloads", call, "saveAfterPermission");
            return;
        }
        saveToDownloads(call);
    }

    @PermissionCallback
    private void saveAfterPermission(PluginCall call) {
        if (getPermissionState("downloads") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("Cần quyền ghi để lưu vào Downloads");
            return;
        }
        saveToDownloads(call);
    }

    private void saveToDownloads(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("Không có dữ liệu để lưu");
            return;
        }

        String fileName = call.getString("fileName", "tep-dinh-kem");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        try {
            Uri uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            } else {
                File directory = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (directory == null || (!directory.exists() && !directory.mkdirs())) {
                    throw new IllegalStateException("Không mở được thư mục Downloads");
                }
                uri = Uri.fromFile(new File(directory, fileName));
            }
            if (uri == null) throw new IllegalStateException("Không tạo được tệp đích");
            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
            if (output == null) throw new IllegalStateException("Không mở được tệp đích");
            output.write(Base64.decode(data, Base64.DEFAULT));
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("Không thể lưu tệp", error);
        }
    }
}
