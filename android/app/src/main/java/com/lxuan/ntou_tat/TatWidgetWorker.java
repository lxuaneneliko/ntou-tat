package com.lxuan.ntou_tat;
import android.content.Context;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
public class TatWidgetWorker extends Worker {
    public TatWidgetWorker(Context context, WorkerParameters parameters) { super(context, parameters); }
    @Override public Result doWork() { TatWidgetProvider.updateAll(getApplicationContext()); return Result.success(); }
}
