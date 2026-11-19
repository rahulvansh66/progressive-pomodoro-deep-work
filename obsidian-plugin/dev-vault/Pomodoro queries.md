# Pomodoro queries

These need the community **Dataview** plugin. The plugin's own dashboard works without it.

## Focus per day

```dataview
TABLE WITHOUT ID key AS Day, sum(rows.item.actual) AS "Focus min", length(rows) AS Blocks
FROM "Pomodoro Log"
FLATTEN file.lists AS item
WHERE item.rating
GROUP BY file.link
SORT key DESC
```

## Every block in flow

```dataview
TABLE WITHOUT ID file.link AS Day, item.planned AS Planned, item.actual AS Actual, item.task AS Task
FROM "Pomodoro Log"
FLATTEN file.lists AS item
WHERE item.rating = "flow"
SORT file.name DESC
```

## Time spent on this task

Put this in a task note to total its sessions:

```dataview
TABLE WITHOUT ID sum(rows.item.actual) AS "Focus min", length(rows) AS Blocks
FROM "Pomodoro Log"
FLATTEN file.lists AS item
WHERE contains(item.task, this.file.link)
GROUP BY true
```
