# Add Ascent to Peakbagger

A Chrome extension that simplifies logging ascents on peakbagger.com by using your GPX track as the starting point.

<img width="329" alt="Image" src="https://github.com/user-attachments/assets/99092973-2bd8-4b4d-897c-888a58d672c4" />

## Features

- **Automatic Peak Detection**: Analyzes your GPX track and automatically identifies nearby peaks from Peakbagger's database
- **Smart Track Processing**:
  - Automatically reduces track points to meet Peakbagger's requirement of a max of 3000 points while preserving track shape
  - Calculates key statistics including elevation gain/loss, distance, and duration automatically
  - Splits track into ascent and descent segments
- **Bulk Processing**: Log multiple peaks from a single GPX track
- **Manual Peak Selection**: If the automatic peak detection doesn't show the peak, you can use the manual search feature to search and select the peak

## Requirements

- A GPX track file with:
  - Elevation data (if missing, use [GPS Visualizer](https://www.gpsvisualizer.com/elevation))
  - Timestamps (if missing, use [GPS Track Editor](https://gotoes.org/strava/Add_Timestamps_To_GPX.php))
- A Peakbagger.com account
- Google Chrome browser

## How to Use

1. **Install the Extension**

   - Install from the Chrome Web Store (link coming soon)

2. **Login to Peakbagger**

   - The extension will prompt you to log in to Peakbagger.com if you haven't already

3. **Upload Your GPX Track**

   - Click "Select File" and choose your GPX track
   - The extension will automatically process and validate your file

4. **Choose Processing Mode**

   - **Auto Detect**: Automatically finds peaks near your track
   - **Manual Select**: Search for specific peaks to add

5. **Review and Submit**
   - The extenion opens the add ascent page on peakbagger.com for each peak selected in a new tab
   - The extension will pre-fill ascent details on the new tabs
   - Review the information and make any necessary adjustments
   - Submit your ascent(s)

## Troubleshooting

Common issues and their solutions:

- **"No elevation data"**: Your GPX file is missing elevation data. Add it using [GPS Visualizer](https://www.gpsvisualizer.com/elevation)
- **"No timestamp data"**: Your GPX file is missing timestamps. Add them using [GPS Track Editor](https://gotoes.org/strava/Add_Timestamps_To_GPX.php)
- **"Failed to fetch nearby peaks"**: Check your internet connection and ensure you're logged into Peakbagger.com

## Contributing

### Reporting Issues

If you encounter a bug or have a suggestion:

1. Check the [existing issues](https://github.com/nelsonwolf/add_ascent_to_peakbagger/issues) to avoid duplicates
2. Create a new issue with:
   - A clear description of the problem
   - Steps to reproduce the issue
   - Expected vs actual behavior
   - GPX Track you used
   - Any relevant screenshots
   - Your browser version and operating system

### Feature Requests

Have an idea to improve the extension?

1. Check existing issues/feature requests
2. Create a new issue labeled "enhancement"
3. Describe:
   - The problem your feature would solve
   - Your proposed solution
   - Any alternatives you've considered

## Privacy

This extension:

- Only interacts with Peakbagger.com
- Does not collect or store any personal data
- Processes GPX files locally in your browser

## License

MIT License - See LICENSE file for details

## Support

Questions or need help? Create an issue on GitHub or email wolfprime@gmail.com
