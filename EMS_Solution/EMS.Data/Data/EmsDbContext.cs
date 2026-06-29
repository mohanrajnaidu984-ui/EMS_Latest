using Microsoft.EntityFrameworkCore;
using EMS.Data.Models;

namespace EMS.Data.Data;

public class EmsDbContext : DbContext
{
    public EmsDbContext(DbContextOptions<EmsDbContext> options) : base(options)
    {
    }

    public DbSet<Customer> Customers { get; set; }
    public DbSet<Contact> Contacts { get; set; }
    public DbSet<User> Users { get; set; }
    public DbSet<EnquiryItem> EnquiryItems { get; set; }
    public DbSet<Enquiry> Enquiries { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Configure Customer
        modelBuilder.Entity<Customer>(entity =>
        {
            entity.HasKey(e => e.CustomerID);
            entity.Property(e => e.Status).HasDefaultValue("Active");
        });

        // Configure Contact
        modelBuilder.Entity<Contact>(entity =>
        {
            entity.HasKey(e => e.ContactID);
        });

        // Configure User
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.UserID);
            entity.Property(e => e.Status).HasDefaultValue("Active");
        });

        // Configure EnquiryItem
        modelBuilder.Entity<EnquiryItem>(entity =>
        {
            entity.HasKey(e => e.ItemID);
            entity.Property(e => e.Status).HasDefaultValue("Active");
        });

        // Configure Enquiry
        modelBuilder.Entity<Enquiry>(entity =>
        {
            entity.HasKey(e => e.RequestNo);
            entity.Property(e => e.Status).HasDefaultValue("Enquiry");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("GETDATE()");
        });
    }
}
