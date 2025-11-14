using Covid19.Server.Models;
using Covid19.Server.Services;
using Microsoft.AspNetCore.OData;
using Microsoft.EntityFrameworkCore;
using Microsoft.OData.ModelBuilder;

namespace Covid19.Server
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            var modelBuilder = new ODataConventionModelBuilder();
            modelBuilder.EntitySet<CovidConfirmedCase>("CovidConfirmed");
            modelBuilder.EntitySet<CovidDeathCase>("CovidDeath");
            modelBuilder.EntitySet<CovidRecoverCase>("CovidRecover");
            modelBuilder.EntitySet<CovidDailyReport>("CovidDailyReports");
            modelBuilder.EntitySet<CovidDataPoint>("CovidData");


            // Add services to the container.

            builder.Services.AddControllers().AddOData(options => options
                    .Select()
                    .Filter()
                    .OrderBy()
                    .Count()
                    .Expand()
                    .AddRouteComponents("odata", modelBuilder.GetEdmModel())
            );

            builder.Services.AddDbContext<ApplicationDbContext>(options =>
                options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));
            // Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
            builder.Services.AddEndpointsApiExplorer();
            builder.Services.AddSwaggerGen();

            builder.Services.AddHttpClient();
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("AllowReactApp",policy =>
                {
                    policy.WithOrigins("https://localhost:54956")
                          .AllowAnyHeader()
                          .AllowAnyMethod();
                });
            });

            builder.Services.AddScoped<CovidConfirmService>();
            builder.Services.AddScoped<CovidDeathService>();
            builder.Services.AddScoped<CovidRecoverService>();
            builder.Services.AddScoped<DailyReportService>();

            builder.Services.AddScoped<CovidDataService>();


            var app = builder.Build();

            app.UseDefaultFiles();
            app.UseStaticFiles();

            app.UseCors("AllowReactApp");

            // Configure the HTTP request pipeline.
            if (app.Environment.IsDevelopment())
            {
                app.UseSwagger();
                app.UseSwaggerUI();
            }

            app.UseHttpsRedirection();

            app.UseAuthorization();


            app.MapControllers();

            app.MapFallbackToFile("/index.html");

            // Seed data nếu cần
            Task.Run(async () =>
            {
                using (var scope = app.Services.CreateScope())
                {
                    var services = scope.ServiceProvider;
                    var context = services.GetRequiredService<ApplicationDbContext>();
                    var confirmService = services.GetRequiredService<CovidConfirmService>();
                    var deathService = services.GetRequiredService<CovidDeathService>();
                    var recoverService = services.GetRequiredService<CovidRecoverService>();

                    // Kiểm tra nếu DB trống thì seed
                    if (!await context.CovidConfirmedCases.AnyAsync())
                    {
                        Console.WriteLine("Seeding data from CSV...");
                        await confirmService.SeedDataFromCsvAsync();
                        await deathService.SeedDataFromCsvAsync();
                        await recoverService.SeedDataFromCsvAsync();
                        Console.WriteLine("Data seeded successfully.");
                    }
                }
            });

            app.Run();
        }
    }
}
