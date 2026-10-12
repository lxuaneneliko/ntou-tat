package com.lxuan.ntou_tat;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.Calendar;
import java.util.List;
import org.json.JSONObject;
public class TatWidgetService extends RemoteViewsService {
    @Override public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new RemoteViewsFactory() {
            List<JSONObject> courses = java.util.Collections.emptyList(); JSONObject colors = new JSONObject();
            public void onCreate() { onDataSetChanged(); }
            public void onDataSetChanged() { JSONObject data = TatWidgetProvider.snapshot(TatWidgetService.this); courses = TatWidgetProvider.today(data, Calendar.getInstance()); colors = TatWidgetProvider.widgetColors(TatWidgetService.this, data); }
            public void onDestroy() { }
            public int getCount() { return courses.size(); }
            public RemoteViews getViewAt(int position) { return position < courses.size() ? TatWidgetProvider.row(TatWidgetService.this, courses.get(position), TatWidgetProvider.color(colors, "text", "#f5f7fb"), TatWidgetProvider.color(colors, "accent", "#f2b84b")) : null; }
            public RemoteViews getLoadingView() { return null; }
            public int getViewTypeCount() { return 1; }
            public long getItemId(int position) { return position; }
            public boolean hasStableIds() { return true; }
        };
    }
}
